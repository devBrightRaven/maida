// P1 sidebar symbol bloom + Large motion effects setting + NOT NOW decoration.
// Browser-only fixture (history-fixture.js); the new preference is persisted
// through a mocked bridge backed by localStorage, so a reload proves the
// get/set round trip without touching the user's Tauri data directory.
// Usage: dev server on 5197, then `node e2e/bloom-motion-check.mjs`.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5197';
const SHOTS = 'design/maida2-review/p1/screens';
await mkdir(SHOTS, { recursive: true });

// Runs after installHistoryFixture. Persists the large-motion preference in
// localStorage (survives reload) and counts every ghost node ever created.
function patchBridgeAndCount() {
    const inner = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args = {}) => {
        if (cmd === 'get_maida2_large_motion') {
            const raw = localStorage.getItem('__e2e_maida2LargeMotion');
            return raw === null ? true : raw === 'true';
        }
        if (cmd === 'set_maida2_large_motion') {
            localStorage.setItem('__e2e_maida2LargeMotion', String(args.enabled));
            return { success: true, enabled: args.enabled };
        }
        return inner(cmd, args);
    };
    window.__bloom = { created: 0, maxAlive: 0, faces: [] };
    new window.MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (n.classList?.contains('mode-bloom-ghost')) {
                    window.__bloom.created += 1;
                    window.__bloom.faces.push(n.dataset.bloomFace);
                }
            }
        }
        const alive = document.querySelectorAll('.mode-bloom-ghost').length;
        window.__bloom.maxAlive = Math.max(window.__bloom.maxAlive, alive);
    }).observe(document, { childList: true, subtree: true });
}

const browser = await chromium.launch();
const results = [];
const pass = (name, detail = '') => { results.push(`PASS ${name}${detail ? `: ${detail}` : ''}`); };

async function openPage({ theme = 'dark', reduce = false } = {}) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: theme, reducedMotion: reduce ? 'reduce' : 'no-preference' });
    await page.addInitScript(installHistoryFixture, { locale: 'en' });
    await page.addInitScript(patchBridgeAndCount);
    await page.goto(BASE);
    await page.locator('.mode-navigation [data-face="rin"]').waitFor();
    // Past the rail's mount-quiet window so focus-triggered blooms count.
    await page.waitForTimeout(700);
    return page;
}
const ghost = page => page.locator('.mode-bloom-ghost');
const bloomStats = page => page.evaluate(() => window.__bloom);
async function parkMouse(page) { await page.mouse.move(1200, 780); }

// Frame-rate sample across one bloom via rAF timestamps.
async function sampleFps(page, face) {
    await parkMouse(page);
    await page.waitForTimeout(400);
    return page.evaluate(async (f) => {
        const times = [];
        let run = true;
        const tick = (t) => { times.push(t); if (run) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        document.querySelector(`.mode-navigation [data-face="${f}"]`).dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
        await new Promise(r => { const check = () => document.querySelector('.mode-bloom-ghost') ? r() : setTimeout(check, 5); check(); });
        const start = performance.now();
        await new Promise(r => { const check = () => !document.querySelector('.mode-bloom-ghost') ? r() : setTimeout(check, 5); check(); });
        run = false;
        const during = times.filter(t => t >= start);
        const deltas = during.slice(1).map((t, i) => t - during[i]).sort((a, b) => a - b);
        const median = deltas[Math.floor(deltas.length / 2)];
        const p95 = deltas[Math.floor(deltas.length * 0.95)];
        const span = during.at(-1) - during[0];
        return { frames: during.length, medianFps: 1000 / median, meanFps: ((during.length - 1) * 1000) / span, p95FrameMs: p95 };
    }, face);
}

try {
    // 1. Hover: appears, then removed after the animation.
    {
        const page = await openPage({ theme: 'dark' });
        await page.hover('.mode-navigation [data-face="kamae"]');
        await ghost(page).waitFor({ state: 'attached', timeout: 1000 });
        const layer = await page.locator('.mode-bloom-layer').evaluate(el => ({ aria: el.getAttribute('aria-hidden'), inert: el.hasAttribute('inert'), pe: window.getComputedStyle(el).pointerEvents, pos: window.getComputedStyle(el).position }));
        assert.deepEqual(layer, { aria: 'true', inert: true, pe: 'none', pos: 'fixed' });
        await page.waitForTimeout(350);
        await page.screenshot({ path: `${SHOTS}/bloom-mid-dark.png` });
        await ghost(page).waitFor({ state: 'detached', timeout: 1500 });
        assert.equal(await page.evaluate(() => document.activeElement.closest('.mode-bloom-layer')), null);
        pass('hover bloom appears and is removed', 'layer fixed, aria-hidden, inert, pointer-events none');

        // 2. Focus (keyboard / gamepad .focus()).
        await parkMouse(page);
        await page.locator('.mode-navigation [data-face="maida2"]').focus();
        await ghost(page).waitFor({ state: 'attached', timeout: 1000 });
        await ghost(page).waitFor({ state: 'detached', timeout: 1500 });
        pass('focus bloom appears and is removed');

        // 3. Rapid focus moves: 5 moves in 200ms -> at most one ghost.
        await page.waitForTimeout(300);
        const before = (await bloomStats(page)).created;
        await page.evaluate(async () => {
            for (const f of ['rin', 'kamae', 'maida2', 'rin', 'kamae']) {
                document.querySelector(`.mode-navigation [data-face="${f}"]`).focus();
                await new Promise(r => setTimeout(r, 40));
            }
        });
        await page.waitForTimeout(1600);
        const stats = await bloomStats(page);
        assert(stats.created - before <= 1, `rapid focus produced ${stats.created - before} ghosts`);
        assert(stats.maxAlive <= 1, `maxAlive ${stats.maxAlive}`);
        pass('rapid 5 focus moves in 200ms', `${stats.created - before} ghost (face ${stats.faces.at(-1)}), max alive ${stats.maxAlive}`);

        // 4. Frame rate at 1280x800.
        const fps = [];
        for (const f of ['maida2', 'rin', 'kamae', 'rin', 'maida2']) fps.push(await sampleFps(page, f));
        const medians = fps.map(s => s.medianFps).sort((a, b) => a - b);
        const medianFps = medians[Math.floor(medians.length / 2)];
        results.push(`FPS 1280x800 headless Chromium: per-bloom median ${fps.map(s => s.medianFps.toFixed(1)).join(' / ')}; per-bloom mean ${fps.map(s => s.meanFps.toFixed(1)).join(' / ')}; median of medians ${medianFps.toFixed(1)}; worst p95 frame ${Math.max(...fps.map(s => s.p95FrameMs)).toFixed(1)}ms`);
        assert(medianFps >= 50, `median fps ${medianFps}`);
        const means = fps.map(s => s.meanFps).sort((a, b) => a - b);
        assert(means[Math.floor(means.length / 2)] >= 50, `median of per-bloom mean fps ${means[Math.floor(means.length / 2)]}`);
        await page.close();
    }

    // Light mid-animation screenshot.
    {
        const page = await openPage({ theme: 'light' });
        await page.hover('.mode-navigation [data-face="kamae"]');
        await ghost(page).waitFor({ state: 'attached', timeout: 1000 });
        await page.waitForTimeout(350);
        await page.screenshot({ path: `${SHOTS}/bloom-mid-light.png` });
        await page.close();
    }

    // 5. Initial mount focus does not bloom.
    {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.addInitScript(installHistoryFixture, { locale: 'en' });
        await page.addInitScript(patchBridgeAndCount);
        await page.goto(BASE);
        await page.locator('.mode-navigation [data-face="rin"]').waitFor();
        await page.locator('.mode-navigation [data-face="rin"]').focus();
        await page.waitForTimeout(900);
        assert.equal((await bloomStats(page)).created, 0);
        pass('no bloom for focus placed during mount');
        await page.close();
    }

    // 6. OS reduce: never plays, even with the setting on.
    {
        const page = await openPage({ reduce: true });
        await page.hover('.mode-navigation [data-face="kamae"]');
        await page.locator('.mode-navigation [data-face="rin"]').focus();
        await page.waitForTimeout(900);
        assert.equal((await bloomStats(page)).created, 0);
        pass('OS reduce-motion: no ghost with setting ON');
        await page.close();
    }

    // 7. Setting OFF: persists across reload, bloom absent.
    {
        const page = await openPage({ theme: 'dark' });
        await page.keyboard.press('F10');
        await page.locator('.kamae-settings').waitFor();
        await page.locator('.kamae-settings-disclosure[aria-controls="a11y-options"]').click();
        const on = page.locator('[data-large-motion="true"]');
        const off = page.locator('[data-large-motion="false"]');
        assert.equal(await on.getAttribute('aria-checked'), 'true', 'default ON');
        await on.focus();
        const outline = await on.evaluate(el => window.getComputedStyle(el).outlineStyle);
        assert.notEqual(outline, 'none', 'toggle focus visible');
        await on.scrollIntoViewIfNeeded();
        await page.locator('#a11y-large-motion-heading').evaluate(el => el.closest('.kamae-settings-a11y-item').scrollIntoView({ block: 'center' }));
        await page.screenshot({ path: `${SHOTS}/settings-motion-toggle.png` });
        await off.press('Enter');
        assert.equal(await off.getAttribute('aria-checked'), 'true');
        assert.equal(await page.evaluate(() => localStorage.getItem('__e2e_maida2LargeMotion')), 'false');
        await page.reload();
        await page.locator('.mode-navigation [data-face="rin"]').waitFor();
        await page.waitForTimeout(700);
        await page.hover('.mode-navigation [data-face="kamae"]');
        await page.locator('.mode-navigation [data-face="rin"]').focus();
        await page.waitForTimeout(900);
        assert.equal((await bloomStats(page)).created, 0, 'setting OFF: no ghost');
        await page.keyboard.press('F10');
        await page.locator('.kamae-settings').waitFor();
        await page.locator('.kamae-settings-disclosure[aria-controls="a11y-options"]').click();
        assert.equal(await page.locator('[data-large-motion="false"]').getAttribute('aria-checked'), 'true', 'OFF persisted across reload');
        pass('setting OFF persists across reload and blocks bloom');
        await page.close();
    }

    // 8. NOT NOW: no strike-through when focused / hovered.
    {
        const page = await openPage({ theme: 'dark' });
        await page.locator('.mode-navigation [data-face="rin"]').click();
        const btn = page.locator('.rin-stage .mvp-btn.not-today');
        await btn.waitFor();
        await btn.focus();
        const focused = await btn.evaluate(el => ({ line: window.getComputedStyle(el).textDecorationLine, outline: window.getComputedStyle(el).outlineStyle }));
        assert.equal(focused.line, 'none');
        assert.notEqual(focused.outline, 'none');
        await btn.hover();
        assert.equal(await btn.evaluate(el => window.getComputedStyle(el).textDecorationLine), 'none');
        pass('NOT NOW text-decoration-line', `focused=${focused.line}, outline=${focused.outline}, hover=none`);
        await page.close();
    }
} finally {
    await browser.close();
}
console.log(results.join('\n'));
