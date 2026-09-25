import { chromium } from '@playwright/test';
import process from 'node:process';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { installHistoryFixture } from './history-fixture.js';

const baseUrl = process.env.MAIDA_TEST_URL || 'http://127.0.0.1:5197';
const output = 'design/closeout-review';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
    // Stop modules entirely: first paint must still respect the saved theme.
    for (const [theme, expected] of [['dark', 'rgb(10, 10, 10)'], ['light', 'rgb(253, 251, 247)']]) {
        const page = await browser.newPage();
        await page.addInitScript(({ theme }) => {
            localStorage.setItem('maida-theme', theme);
            localStorage.setItem('maida_locale', 'zh-CN');
        }, { theme });
        await page.route('**/src/main.jsx', route => route.abort());
        await page.goto(baseUrl);
        assert.equal(await page.evaluate(() => window.getComputedStyle(document.documentElement).backgroundColor), expected);
        assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
        const iconUrl = await page.locator('link[rel="icon"]').evaluate(el => el.href);
        const icon = await page.request.get(iconUrl);
        assert(icon.ok(), 'Real app favicon must exist');
        assert.match(icon.headers()['content-type'], /image\/png/);
        results.push({ test: 'pre-module-paint-and-icon', theme, passed: true });
        await page.close();
    }
    for (const layout of ['tabs', 'pager']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.addInitScript(installHistoryFixture, { locale: 'en', layout });
        await page.addInitScript(() => {
            const invoke = window.__TAURI_INTERNALS__.invoke;
            window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
                if (cmd === 'plugin:updater|check') return { rid: 1, available: true, version: '0.4.99', currentVersion: '0.4.3' };
                return invoke(cmd, args);
            };
            window.__pad = { id: 'closeout-test', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
            Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__pad] });
        });
        await page.goto(baseUrl);
        await page.bringToFront();
        const press = async button => {
            await page.evaluate(i => { window.__pad.buttons[i] = { pressed: true, value: 1 }; }, button);
            await page.waitForTimeout(100);
            await page.evaluate(i => { window.__pad.buttons[i] = { pressed: false, value: 0 }; }, button);
            await page.waitForTimeout(100);
        };
        for (const face of ['maida2', 'rin', 'kamae']) {
            const viewSelector = `main.${face === 'rin' ? 'mvp-container' : `${face}-view`}`;
            // Shoulder switching works for both navigation presentations.
            await page.waitForFunction(() => document.querySelector('main') && document.querySelector('.mode-navigation'));
            for (let i = 0; i < 3; i++) {
                if (await page.locator(viewSelector).count()) break;
                await press(5);
            }
            await page.locator(viewSelector).waitFor();
            const footer = page.locator('main > .app-footer');
            await footer.waitFor();
            const update = footer.locator('.version-link');
            await update.waitFor();
            await page.locator('.theme-toggle').focus();
            let reached = false;
            for (let i = 0; i < 65; i++) {
                if (await update.evaluate(el => el === document.activeElement)) { reached = true; break; }
                await press(13);
            }
            assert(reached, `${layout}/${face}: gamepad must reach update button`);
            const ring = await update.evaluate(el => {
                const style = window.getComputedStyle(el);
                return { outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth), boxShadow: style.boxShadow };
            });
            assert((ring.outlineStyle !== 'none' && ring.outlineWidth > 0) || ring.boxShadow !== 'none', `${layout}/${face}: gamepad update focus must be visible`);
            // Assert source styles are reflected in visible UI and pseudo-elements.
            const rounded = await page.evaluate(() => [...document.querySelectorAll('body *')].flatMap(el => {
                const rect = el.getBoundingClientRect();
                if (!rect.width || !rect.height) return [];
                return [null, '::before', '::after'].flatMap(pseudo => {
                    const css = window.getComputedStyle(el, pseudo);
                    if (pseudo && (css.content === 'none' || css.content === 'normal')) return [];
                    return ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].some(key => parseFloat(css[key]) > 0) ? [`${el.className}${pseudo || ''}`] : [];
                });
            }));
            assert.deepEqual(rounded, [], `${layout}/${face}: square UI geometry`);
            await page.screenshot({ path: `${output}/${layout}-${face}.png` });
            results.push({ layout, face, gamepadUpdateReachable: true, squareGeometry: true });
            await press(5);
        }
        await page.close();
    }
    await writeFile(`${output}/checks.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
} finally { await browser.close(); }
