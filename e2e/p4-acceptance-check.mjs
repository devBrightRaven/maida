// P4 acceptance matrix — rows with no existing dedicated check (soen research
// loop, 2026-09-26). Covers, per view (Maai/Rin/Kamae/Settings/History):
//   1. Simulated 200% zoom via HALVED viewport width (640x400 instead of
//      1280x800) — the closest headless proxy for what a real 200% browser
//      zoom does to the CSS layout viewport (halves available CSS px).
//      NOT a substitute for actual browser zoom: Beacon's own design-qa gate
//      states explicitly "CSS zoom, DPR, deviceScaleFactor, and narrow
//      viewport substitution are not evidence" for the real 200%-zoom row.
//      That row is covered separately by e2e/history-zoom.mjs / footer-zoom.mjs
//      (real chrome://settings/appearance zoom), both requiring a headed
//      Chrome profile and NOT run in this session (memory-pressure bound).
//      An earlier version of this script used CSS `zoom:2` on <html>, which
//      produced a self-referential measurement artifact (scrollWidth doubled
//      against an unzoomed clientWidth) rather than a real reflow signal;
//      replaced with the viewport-halving technique below.
//   2. WCAG 1.4.12 text-spacing override (line-height 1.5x, paragraph
//      spacing 2x, letter-spacing 0.12em, word-spacing 0.16em): no clipped
//      text (overflow:hidden container whose content no longer fits).
//   3. prefers-reduced-motion: reduce, set BEFORE navigation: no Web
//      Animations left in the 'running' state once the view has settled.
//   4. Rounded corners: every element + ::before/::after, all four
//      border-radius corners, must compute to 0 (same method as
//      e2e/closeout-check.mjs's squareGeometry assertion, which already
//      covers Maai/Rin/Kamae; this script re-asserts those three for a
//      single consistent record and additionally covers Settings/History,
//      which closeout-check.mjs does not open).
//
// A physical DualShock 4 is attached to this machine; navigator.getGamepads
// is stubbed (returns []) on every page this script opens so no physical
// controller input can reach the app.
//
// Usage: dev server up, then `E2E_BASE_URL=http://host:port node e2e/p4-acceptance-check.mjs`.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5197';
const OUT = 'design/maida2-review/p4';
await mkdir(OUT, { recursive: true });

const stubGamepad = () => {
    Object.defineProperty(navigator, 'getGamepads', { value: () => [] });
};

const TEXT_SPACING_CSS = `
* {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
}
p, li, h1, h2, h3, h4, h5, h6 {
    margin-bottom: 2em !important;
}
`;

async function openView(page, name) {
    await page.locator('.mode-navigation').waitFor();
    if (name === 'maida2') {
        await page.locator('[data-face="maida2"]').click();
        await page.locator('.maida2-view').waitFor();
    } else if (name === 'rin') {
        await page.locator('[data-face="rin"]').click();
        await page.locator('.mvp-container').waitFor();
    } else if (name === 'kamae') {
        await page.locator('[data-face="kamae"]').click();
        await page.locator('.kamae-view').waitFor();
    } else if (name === 'settings') {
        await page.keyboard.press('F10');
        await page.locator('.kamae-settings').waitFor();
    } else if (name === 'history') {
        await page.locator('.mode-navigation [data-history-game]').click();
        await page.locator('.decision-history').waitFor();
        await page.locator('.history-events li').first().waitFor();
    }
    await page.waitForTimeout(150);
}

async function checkNoHorizontalScroll(page) {
    return page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
    }));
}

async function checkClippedText(page) {
    return page.evaluate(() => {
        const offenders = [];
        for (const el of document.querySelectorAll('body *')) {
            const style = window.getComputedStyle(el);
            if (style.overflow !== 'hidden' && style.overflowY !== 'hidden') continue;
            if (el.closest('.sr-only') || el.classList.contains('sr-only')) continue; // intentional clip, red line 7.5-adjacent
            if (!el.textContent || !el.textContent.trim()) continue;
            if (el.scrollHeight > el.clientHeight + 2) {
                offenders.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 80) });
            }
        }
        return offenders;
    });
}

async function checkRunningAnimations(page) {
    return page.evaluate(() => {
        if (typeof document.getAnimations !== 'function') return { supported: false, running: [] };
        const running = document.getAnimations()
            .filter(a => a.playState === 'running')
            .map(a => ({ id: a.id || null, effect: a.effect?.target?.className?.toString().slice(0, 80) || null }));
        return { supported: true, running };
    });
}

async function checkRoundedCorners(page) {
    return page.evaluate(() => [...document.querySelectorAll('body *')].flatMap(el => {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return [];
        return [null, '::before', '::after'].flatMap(pseudo => {
            const css = window.getComputedStyle(el, pseudo);
            if (pseudo && (css.content === 'none' || css.content === 'normal')) return [];
            return ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']
                .some(key => parseFloat(css[key]) > 0) ? [`${el.tagName}.${el.className}${pseudo || ''}`] : [];
        });
    }));
}

const VIEWS = ['maida2', 'rin', 'kamae', 'settings', 'history'];
const results = [];
const failures = [];
const browser = await chromium.launch();
try {
    // --- 1 & 4: simulated-200%-zoom (halved viewport) no-h-scroll, and rounded corners ---
    for (const view of VIEWS) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.addInitScript(stubGamepad);
        await page.addInitScript(installHistoryFixture, { locale: 'zh-TW' });
        await page.goto(BASE);
        await openView(page, view);

        const before = await checkNoHorizontalScroll(page);
        await page.setViewportSize({ width: 640, height: 400 });
        await page.waitForTimeout(150);
        const after = await checkNoHorizontalScroll(page);
        const corners = await checkRoundedCorners(page);

        try {
            assert(before.scrollWidth <= before.clientWidth + 1, `${view}: horizontal scroll present at 1280x800 (${before.scrollWidth} > ${before.clientWidth})`);
            assert(after.scrollWidth <= after.clientWidth + 1, `${view}: horizontal scroll present at simulated-200%-zoom viewport 640x400 (${after.scrollWidth} > ${after.clientWidth})`);
            assert.deepEqual(corners, [], `${view}: non-zero border-radius corners found: ${JSON.stringify(corners)}`);
            results.push({ view, check: 'zoom-200-no-hscroll', pass: true, before, after });
            results.push({ view, check: 'rounded-corners-zero', pass: true, offenders: corners });
        } catch (err) {
            failures.push({ view, check: 'zoom-or-corners', message: err.message });
            results.push({ view, check: 'zoom-200-no-hscroll/rounded-corners-zero', pass: false, before, after, corners, error: err.message });
        }
        await page.screenshot({ path: `${OUT}/zoom200-${view}.png` }).catch(() => {});
        await page.close();
    }

    // --- 2: text-spacing override (WCAG 1.4.12), fresh page per view ---
    for (const view of VIEWS) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.addInitScript(stubGamepad);
        await page.addInitScript(installHistoryFixture, { locale: 'zh-TW' });
        await page.goto(BASE);
        await openView(page, view);
        await page.addStyleTag({ content: TEXT_SPACING_CSS });
        await page.waitForTimeout(150);
        const clipped = await checkClippedText(page);
        const scroll = await checkNoHorizontalScroll(page);
        try {
            assert.deepEqual(clipped, [], `${view}: clipped text under WCAG 1.4.12 text-spacing override: ${JSON.stringify(clipped)}`);
            results.push({ view, check: 'text-spacing-1.4.12-no-clip', pass: true, clipped, scroll });
        } catch (err) {
            failures.push({ view, check: 'text-spacing', message: err.message });
            results.push({ view, check: 'text-spacing-1.4.12-no-clip', pass: false, clipped, scroll, error: err.message });
        }
        await page.close();
    }

    // --- 3: prefers-reduced-motion set before navigation, no running animations once settled ---
    for (const view of VIEWS) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.addInitScript(stubGamepad);
        await page.addInitScript(installHistoryFixture, { locale: 'zh-TW' });
        await page.goto(BASE);
        await openView(page, view);
        await page.waitForTimeout(400); // let any transition triggered by navigation settle
        const anim = await checkRunningAnimations(page);
        try {
            assert.equal(anim.running.length, 0, `${view}: animation(s) still running under reduced-motion: ${JSON.stringify(anim.running)}`);
            results.push({ view, check: 'reduced-motion-no-running-animation', pass: true, animationsApiSupported: anim.supported });
        } catch (err) {
            failures.push({ view, check: 'reduced-motion', message: err.message });
            results.push({ view, check: 'reduced-motion-no-running-animation', pass: false, animation: anim, error: err.message });
        }
        await page.close();
    }

    await writeFile(`${OUT}/p4-acceptance-check.json`, JSON.stringify({ results, failures }, null, 2));
    console.log(`p4-acceptance-check: ${results.length} checks recorded across ${VIEWS.length} views (${VIEWS.join(', ')}). Failures: ${failures.length}`);
    if (failures.length) {
        for (const f of failures) console.log(`FAIL [${f.view}/${f.check}] ${f.message}`);
        process.exitCode = 1;
    }
} finally {
    await browser.close();
}
