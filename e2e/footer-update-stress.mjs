import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { installHistoryFixture } from './history-fixture.js';

const browser = await chromium.launch();
const results = [];
try {
    for (const locale of ['en', 'ja', 'zh-TW', 'zh-CN']) {
        for (const theme of ['light', 'dark']) {
            for (const [width, height] of [[1280, 720], [320, 568]]) {
                const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
                await page.addInitScript(installHistoryFixture, { locale });
                await page.addInitScript(() => {
                    for (const game of window.__historyFixture.data.games.games) {
                        game.title = 'An exceptionally long game title: 完整典藏版・ディレクターズカット ' + 'SuperLongUnbrokenGameName'.repeat(6);
                    }
                    const invoke = window.__TAURI_INTERNALS__.invoke;
                    window.__TAURI_INTERNALS__.invoke = async (cmd, args) => cmd === 'plugin:updater|check'
                        ? { rid: 1, available: true, version: '0.4.99', currentVersion: '0.4.3' }
                        : invoke(cmd, args);
                });
                await page.goto('http://127.0.0.1:5197');
                for (const face of ['maida2', 'rin', 'kamae']) {
                    await page.locator(`[data-face="${face}"]`).click();
                    const update = page.locator('.app-footer .version-link');
                    await update.waitFor();
                    await update.focus();
                    const metrics = await page.evaluate(() => {
                        const root = document.querySelector('.app-root');
                        const main = document.querySelector('main:has(> .mode-navigation)');
                        const footer = main.querySelector('.app-footer');
                        const update = footer.querySelector('.version-link');
                        const s = window.getComputedStyle(update);
                        return { rootOverflow: root.scrollWidth > root.clientWidth + 1, mainOverflow: main.scrollWidth > main.clientWidth + 1, footerOverflow: footer.scrollWidth > footer.clientWidth + 1, footerScrollWidth: footer.scrollWidth, footerChildren: [...footer.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > footer.getBoundingClientRect().right).map(el => ({ className: el.className, rect: el.getBoundingClientRect().toJSON() })), mainBottom: main.getBoundingClientRect().bottom, footer: footer.getBoundingClientRect().toJSON(), update: update.getBoundingClientRect().toJSON(), focusOutline: `${s.outlineStyle} ${s.outlineWidth}`, focusShadow: s.boxShadow };
                    });
                    assert(!metrics.rootOverflow && !metrics.mainOverflow && !metrics.footerOverflow, JSON.stringify({ locale, theme, width, face, metrics }));
                    assert(metrics.footer.bottom <= height + 1 && metrics.footer.top >= 0);
                    assert(metrics.mainBottom <= metrics.footer.top + 1);
                    assert(metrics.update.top >= metrics.footer.top && metrics.update.bottom <= metrics.footer.bottom + 1);
                    results.push({ locale, theme, width, height, face, ...metrics });
                }
                await page.close();
            }
        }
    }
    await writeFile('design/closeout-review/footer-update-stress.json', JSON.stringify(results, null, 2));
    console.log(`${results.length} long-title/update-available footer layouts passed`);
} finally { await browser.close(); }
