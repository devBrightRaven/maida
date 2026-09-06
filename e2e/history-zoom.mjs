import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';
const context = await chromium.launchPersistentContext('design/history-review/zoom-profile', { headless: false, viewport: null, args: ['--window-size=1440,1000'] });
try {
    const settings = await context.newPage();
    await settings.goto('chrome://settings/appearance');
    await settings.locator('#zoomLevel').selectOption({ label: '200%' });
    const zoom = await settings.locator('#zoomLevel').evaluate(el => el.selectedOptions[0].textContent.trim());
    assert.equal(zoom, '200%');
    const records = [];
    for (const mode of ['tabs-maida2', 'tabs-rin', 'tabs-kamae', 'pager-maida2', 'pager-rin', 'pager-kamae', 'history']) {
        const page = await context.newPage();
        await page.addInitScript(installHistoryFixture, { locale: 'ja', layout: mode.startsWith('pager') ? 'pager' : 'tabs' });
        await page.goto('http://localhost:5199');
        await page.locator('.mode-navigation').waitFor();
        const face = mode.split('-')[1];
        if (face && face !== 'maida2') {
            if (mode.startsWith('tabs')) await page.locator(`[data-face="${face}"]`).click();
            else for (let i = 0; i < (face === 'rin' ? 1 : 2); i++) await page.locator('.mode-navigation__pager-button--next').click();
        }
        if (mode === 'history') {
            await page.locator('.mode-navigation [data-history-game]').click();
            await page.locator('.history-events li').first().waitFor();
        }
        await page.evaluate(() => { document.title = 'Maida history zoom verification'; window.scrollTo(0, 0); });
        await page.bringToFront();
        const metrics = await page.evaluate(() => ({ innerWidth: window.innerWidth, outerWidth: window.outerWidth, dpr: window.devicePixelRatio, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
        assert.equal(metrics.overflow, false);
        const overlaps = await page.evaluate(() => [...document.querySelectorAll('.theme-toggle,.help-tour-btn')].some(control => {
            const a = control.getBoundingClientRect();
            return [...document.querySelectorAll('.mode-navigation button,.m2-card,.kata-item,.mvp-btn:not(.is-hidden)')].some(target => {
                const b = target.getBoundingClientRect();
                return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            });
        }));
        assert.equal(overlaps, false, `${mode}: toolbar overlaps at 200% zoom`);
        execFileSync('pwsh', ['-NoProfile', '-File', process.argv[2], '-WindowTitle', '*Maida history zoom verification*', '-OutputPath', path.resolve(`design/history-review/zoom-${mode}.png`)], { windowsHide: true });
        records.push({ mode, ...metrics });
        await page.close();
    }
    await settings.locator('#zoomLevel').selectOption({ label: '100%' });
    await writeFile('design/history-review/zoom.json', JSON.stringify({ zoom, records, method: 'Real Chromium Appearance page zoom, native window screenshots' }, null, 2));
    console.log('Actual 200% zoom verified; restored to 100%');
} finally { await context.close(); }
