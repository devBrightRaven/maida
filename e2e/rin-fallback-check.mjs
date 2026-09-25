// P3 trial: Rin art-box no-art fallback (RinFacingMark, inline SVG).
// Asserts: no hero art -> the geometric mark renders (decorative <svg>,
// aria-hidden, non-zero size filling the box, stroke resolves to the accent
// token, no <img> in the box); broken hero art (image load error) -> status
// 'failed' shows the same mark; real art -> no mark; TRY button y-position
// is identical across art / no-art / failed at both canvas sizes, in both
// themes; forced-colors mode swaps the mark's stroke to a system color
// instead of the accent. Also captures the review screenshots for this trial.
// Usage: dev server up, then `E2E_BASE_URL=http://host:port node e2e/rin-fallback-check.mjs`.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5197';
const OUT = 'design/maida2-review/p3';
const SHOTS = `${OUT}/screens`;
await mkdir(SHOTS, { recursive: true });

// Deliberately tiny, valid, 1x1 red PNG — stands in for real hero art so
// this check doesn't depend on a local Steam library cache.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// Runs in the page after installHistoryFixture: route get_art per mode.
function patchFixture({ mode, tinyPng }) {
    const inner = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args = {}) => {
        if (cmd === 'get_art') {
            if (mode === 'noart') return null;
            if (mode === 'broken') return 'data:image/jpeg;base64,AAAA'; // invalid: forces img onError
            if (mode === 'art') return args.kind === 'hero' ? tinyPng : null;
        }
        return inner(cmd, args);
    };
}

// Runs in the page: reads the mark's geometry, decorative attributes, and
// its resolved stroke color alongside the currently-resolved accent token
// and two system colors, all as getComputedStyle-canonical strings so the
// caller can compare them directly regardless of theme or forced-colors.
function collectMarkInfo() {
    const box = document.querySelector('.rin-art');
    const svg = document.querySelector('.rin-art svg.rin-art__mark');
    const g = svg?.querySelector('g');
    const boxRect = box?.getBoundingClientRect();
    const svgRect = svg?.getBoundingClientRect();
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;';
    document.body.appendChild(probe);
    probe.style.color = 'var(--m2-accent)';
    const accentColor = window.getComputedStyle(probe).color;
    probe.style.color = 'CanvasText';
    const canvasText = window.getComputedStyle(probe).color;
    probe.style.color = 'Highlight';
    const highlight = window.getComputedStyle(probe).color;
    probe.remove();
    return {
        status: box?.dataset.artStatus,
        boxAriaHidden: box?.getAttribute('aria-hidden'),
        svgPresent: !!svg,
        svgAriaHidden: svg?.getAttribute('aria-hidden'),
        imgCount: document.querySelectorAll('.rin-art img').length,
        boxWidth: boxRect?.width ?? 0,
        boxHeight: boxRect?.height ?? 0,
        svgWidth: svgRect?.width ?? 0,
        svgHeight: svgRect?.height ?? 0,
        strokeColor: g ? window.getComputedStyle(g).stroke : null,
        accentColor,
        canvasText,
        highlight,
    };
}

const browser = await chromium.launch();
const records = [];

async function openRin({ width, height, theme = 'light', mode = 'art', forcedColors }) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
    if (forcedColors) await page.emulateMedia({ colorScheme: theme, forcedColors });
    // Isolation: headless Chromium on this dev machine sees a physical
    // DualShock 4 controller — stub it out so no real input reaches the page.
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
    });
    // Rin's game pick (engine.js getActiveGame) and prescription text
    // (getPrescription) both use Math.random. Pin it so every openRin()
    // call resolves to the same game + text — otherwise the TRY button's
    // y-position varies with description line count, independent of art
    // status, and confounds the position-stability assertion below.
    await page.addInitScript(() => { Math.random = () => 0; });
    await page.addInitScript(installHistoryFixture, { locale: 'en' });
    await page.addInitScript(patchFixture, { mode, tinyPng: TINY_PNG });
    await page.goto(BASE);
    await page.locator('[data-face="rin"]').click();
    await page.locator('.rin-stage .mvp-btn.visit').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
        const s = document.querySelector('.rin-art')?.dataset.artStatus;
        return s && s !== 'loading';
    });
    await page.waitForTimeout(250);
    return page;
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

try {
    // 1. No-art: mark present, decorative, aria-hidden, fills the box, no
    // img at all, stroke resolves to the accent token (not transparent).
    for (const theme of ['light', 'dark']) {
        for (const [w, h] of [[1280, 800], [1280, 720]]) {
            const page = await openRin({ width: w, height: h, theme, mode: 'noart' });
            const info = await page.evaluate(collectMarkInfo);
            assert.equal(info.status, 'none', `art status: ${theme} ${w}x${h}`);
            assert.equal(info.boxAriaHidden, 'true', `box aria-hidden: ${theme} ${w}x${h}`);
            assert.equal(info.svgAriaHidden, 'true', `mark aria-hidden: ${theme} ${w}x${h}`);
            assert.equal(info.svgPresent, true, `mark present: ${theme} ${w}x${h}`);
            assert.equal(info.imgCount, 0, `no img in the box: ${theme} ${w}x${h}`);
            assert(info.svgWidth > 0 && info.svgHeight > 0, `mark has non-zero size: ${theme} ${w}x${h}`);
            assert(Math.abs(info.svgWidth - info.boxWidth) <= 1 && Math.abs(info.svgHeight - info.boxHeight) <= 1, `mark fills the box: ${theme} ${w}x${h}`);
            assert.equal(info.strokeColor, info.accentColor, `stroke resolves to the accent: ${theme} ${w}x${h}`);
            assert.notEqual(info.strokeColor, 'rgba(0, 0, 0, 0)', `stroke is not transparent: ${theme} ${w}x${h}`);
            records.push({ label: `no-art ${theme} ${w}x${h}`, ...info });
            if (w === 1280 && h === 800) await shot(page, `rin-fallback-${theme}-1280x800`);
            if (w === 1280 && h === 720) await shot(page, `rin-fallback-${theme}-1280x720`);
            await page.close();
        }
    }

    // 2. Broken hero art (image load error) -> status 'failed', same mark.
    {
        const page = await openRin({ width: 1280, height: 800, mode: 'broken' });
        // The image load error fires after the "not loading" wait already
        // resolves (status passes through 'ready' with a broken src first),
        // so wait for the terminal 'failed' status explicitly.
        await page.waitForFunction(() => document.querySelector('.rin-art')?.dataset.artStatus === 'failed', null, { timeout: 5000 });
        await page.waitForTimeout(200);
        const info = await page.evaluate(collectMarkInfo);
        assert.equal(info.status, 'failed', 'art status: broken hero art');
        assert.equal(info.svgPresent, true, 'mark present on failed art');
        assert.equal(info.imgCount, 0, 'no img once the broken hero art is dropped');
        records.push({ label: 'broken-art', ...info });
        await page.close();
    }

    // 3. Real art -> no mark.
    {
        const page = await openRin({ width: 1280, height: 800, mode: 'art' });
        const info = await page.evaluate(collectMarkInfo);
        assert.equal(info.status, 'ready', 'art status: real art');
        assert.equal(info.svgPresent, false, 'no mark when real art loads');
        assert.equal(info.imgCount, 1, 'exactly one img when real art loads');
        records.push({ label: 'real-art', ...info });
        await page.close();
    }

    // 4. TRY button y-position must not shift across art / no-art / failed,
    // at both canvas sizes, in both themes.
    for (const theme of ['light', 'dark']) {
        for (const [w, h] of [[1280, 800], [1280, 720]]) {
            const positions = {};
            for (const [label, mode] of [['art', 'art'], ['none', 'noart'], ['failed', 'broken']]) {
                const page = await openRin({ width: w, height: h, theme, mode });
                const box = await page.locator('.rin-stage .mvp-btn.visit').boundingBox();
                positions[label] = box.y;
                await page.close();
            }
            records.push({ label: `try-y-positions ${theme} ${w}x${h}`, ...positions });
            const values = Object.values(positions);
            const spread = Math.max(...values) - Math.min(...values);
            assert(spread <= 1, `TRY y-position must be stable across art/none/failed: ${theme} ${w}x${h} ${JSON.stringify(positions)}`);
        }
    }

    // 5. forced-colors: active -> mark stroke uses a system color (not the
    // accent token) and stays visible.
    {
        const page = await openRin({ width: 1280, height: 800, mode: 'noart', forcedColors: 'active' });
        const info = await page.evaluate(collectMarkInfo);
        assert.equal(info.status, 'none', 'art status: forced-colors');
        assert.equal(info.svgPresent, true, 'mark present under forced-colors');
        assert.equal(info.strokeColor, info.canvasText, 'mark stroke resolves to CanvasText under forced-colors');
        assert.notEqual(info.strokeColor, info.accentColor, 'mark stroke is not the accent token under forced-colors');
        assert.notEqual(info.strokeColor, 'rgba(0, 0, 0, 0)', 'mark stroke is visible under forced-colors');
        records.push({ label: 'forced-colors', ...info });
        await shot(page, 'rin-fallback-forced-colors');
        await page.close();
    }

    console.log(`rin-fallback-check: ${records.length} checks passed; no-art mark renders (accent stroke, decorative, fills the box), broken art shows the same mark, real art shows no mark, TRY position stable across art/none/failed at both sizes and themes, forced-colors swaps the mark to a system color.`);
} finally {
    await browser.close();
}
