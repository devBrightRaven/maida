// BUG-015: debug Trace panel focus, dialog semantics and contrast.
// Browser-only fixture. Usage: dev server on 5201 (or E2E_BASE_URL), then
// `node e2e/trace-panel-check.mjs`.
//
// Asserts, in light and dark themes:
//  - opening the panel moves focus to its close button, inside role="dialog"
//    named "Maida Behavioral Trace"; the close button has an accessible name
//  - Tab / Shift+Tab stay inside the panel (aria-modal="true")
//  - while open, F9 does not switch face (App.jsx isModalOpen, red line 7.9)
//  - Esc and the close button both return focus to the TRACE button
//  - changed colours reach 4.5:1 (text) / 3:1 (control borders) against the
//    background they are painted on
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import assert from 'node:assert/strict';
import process from 'node:process';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5201';

function noPad() {
    navigator.getGamepads = () => [null, null, null, null];
}

async function enableDebug(page) {
    // App.jsx handleSecretTap: 7 taps, each within 2s of the previous one.
    for (let i = 0; i < 7; i++) {
        await page.evaluate(() => document.querySelector('.mvp-header-tap').click());
        await page.waitForTimeout(40);
    }
    await page.locator('.debug-trace-btn').waitFor();
}

async function openPanel(page) {
    await page.locator('.debug-trace-btn').focus();
    await page.keyboard.press('Enter');
    await page.locator('.debug-panel[role="dialog"]').waitFor();
    await page.waitForTimeout(60);
}

const activeInfo = page => page.evaluate(() => {
    const a = document.activeElement;
    return {
        cls: a?.className || a?.tagName,
        inPanel: !!a?.closest('.debug-panel'),
        label: a?.getAttribute('aria-label'),
    };
});

// Contrast of each element's text colour (and border where given) against
// the nearest ancestor with an opaque background. Alpha fills are composited.
const measure = page => page.evaluate(() => {
    const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { rgb: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
    const over = (fg, bg) => fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
    const lum = rgb => { const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (x, y) => { const [h, l] = [lum(x), lum(y)].sort((m, n) => n - m); return (h + 0.05) / (l + 0.05); };
    const bgOf = el => {
        const layers = [];
        for (let n = el; n; n = n.parentElement) {
            const c = parse(window.getComputedStyle(n).backgroundColor);
            if (c.a > 0) layers.push(c);
            if (c.a === 1) break;
        }
        return layers.reverse().reduce((acc, c) => over(c, acc), [255, 255, 255]);
    };
    const out = [];
    const check = (sel, kind) => {
        for (const el of document.querySelectorAll(sel)) {
            const cs = window.getComputedStyle(el);
            const bg = bgOf(el);
            const fg = parse(kind === 'border' ? cs.borderTopColor : cs.color);
            out.push({ sel, kind, ratio: +ratio(over(fg, bg), bg).toFixed(2) });
        }
    };
    check('.debug-muted', 'text');
    check('.debug-select', 'text');
    check('.debug-select', 'border');
    check('.debug-warn-text', 'text');
    check('.sim-actions button', 'text');
    check('.sim-actions button', 'border');
    check('.debug-mini-btn', 'text');
    check('.debug-mini-btn', 'border');
    check('.debug-section h4', 'text');
    const slider = document.querySelector('.sim-row input[type="range"]');
    return { out, sliderAccent: window.getComputedStyle(slider).accentColor };
});

const browser = await chromium.launch();
try {
    for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: theme });
        await page.addInitScript(installHistoryFixture, { locale: 'en' });
        await page.addInitScript(noPad);
        await page.goto(BASE);
        await page.locator('[data-face="rin"]').click();
        await page.locator('.rin-stage .mvp-btn.visit').waitFor();
        await enableDebug(page);

        // Focus in + dialog semantics
        await openPanel(page);
        const dialog = page.getByRole('dialog', { name: 'Maida Behavioral Trace' });
        assert.equal(await dialog.count(), 1, `${theme}: dialog with accessible name`);
        assert.equal(await dialog.getAttribute('aria-modal'), 'true', `${theme}: aria-modal`);
        let a = await activeInfo(page);
        assert.ok(a.inPanel, `${theme}: focus moved into the panel on open (got ${a.cls})`);
        assert.equal(a.label, 'Close debug trace panel', `${theme}: close button focused and named`);

        // Focus trap
        await page.keyboard.press('Shift+Tab');
        a = await activeInfo(page);
        assert.ok(a.inPanel, `${theme}: Shift+Tab from first control stays in panel (got ${a.cls})`);
        for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
        a = await activeInfo(page);
        assert.ok(a.inPanel, `${theme}: Tab x40 stays in panel (got ${a.cls})`);

        // Modal gate (7.9): F9 must not leave Rin while the panel is open
        await page.keyboard.press('F9');
        await page.waitForTimeout(150);
        assert.equal(await page.locator('.debug-panel').count(), 1, `${theme}: F9 blocked while panel open`);
        assert.equal(await page.locator('.mvp-container').count(), 1, `${theme}: still on Rin`);

        // Contrast of changed colours
        const { out, sliderAccent } = await measure(page);
        for (const r of out) {
            const min = r.kind === 'border' ? 3 : 4.5;
            assert.ok(r.ratio >= min, `${theme}: ${r.sel} ${r.kind} ${r.ratio} < ${min}`);
        }
        assert.notEqual(sliderAccent, 'auto', `${theme}: slider accent-color resolved (was undefined --amber)`);
        console.log(`${theme}: min text ${Math.min(...out.filter(r => r.kind === 'text').map(r => r.ratio))}, min border ${Math.min(...out.filter(r => r.kind === 'border').map(r => r.ratio))}, slider ${sliderAccent}`);

        // Focus restore via Esc (focus on the close button, not a text input)
        await page.locator('.debug-close').focus();
        await page.keyboard.press('Escape');
        await page.locator('.debug-panel').waitFor({ state: 'detached' });
        await page.waitForTimeout(100);
        a = await activeInfo(page);
        assert.equal(a.cls, 'debug-trace-btn', `${theme}: Esc restores focus to TRACE (got ${a.cls})`);

        // Focus restore via the close button
        await openPanel(page);
        await page.locator('.debug-close').click();
        await page.locator('.debug-panel').waitFor({ state: 'detached' });
        await page.waitForTimeout(100);
        a = await activeInfo(page);
        assert.equal(a.cls, 'debug-trace-btn', `${theme}: close button restores focus to TRACE (got ${a.cls})`);

        await page.close();
    }
    console.log('trace-panel-check: focus in, focus trap, F9 gate, Esc + close restore to TRACE, contrast >= AA in light and dark.');
} finally {
    await browser.close();
}
