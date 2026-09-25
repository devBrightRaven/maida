// P1 Rin prototype: screenshots, state sheet, overflow sweep.
// Browser-only fixture (history-fixture.js). Art comes from the local Steam
// librarycache when present, read-only, and is passed into the page as data
// URLs; when absent the run falls back to the no-art state and says so.
// Usage: dev server on 5197, then `node e2e/rin-p1-check.mjs`.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5197';
const OUT = 'design/maida2-review/p1';
const SHOTS = `${OUT}/screens`;
await mkdir(SHOTS, { recursive: true });

const LIBRARY = process.env.STEAM_LIBRARYCACHE || 'C:/Program Files (x86)/Steam/appcache/librarycache';
async function findHero(appId) {
    const dir = path.join(LIBRARY, String(appId));
    if (!existsSync(dir)) return null;
    const direct = path.join(dir, 'library_hero.jpg');
    if (existsSync(direct)) return direct;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const nested = path.join(dir, entry.name, 'library_hero.jpg');
        if (entry.isDirectory() && existsSync(nested)) return nested;
    }
    return null;
}
const art = {};
for (const appId of [367520, 413150]) {
    const file = await findHero(appId);
    if (file) art[appId] = `data:image/jpeg;base64,${(await readFile(file)).toString('base64')}`;
}
const artNote = Object.keys(art).length ? `local hero art for ${Object.keys(art).join(', ')}` : 'no local hero art found: art screenshots show the no-art state';

const LONG_TITLE = 'The Legend of Heroes: Trails through Daybreak II — Director’s Extended Edition with Every Chapter';

// Runs in the page after installHistoryFixture: route get_art, optional
// long title, optional broken art.
function patchFixture({ art: artMap, mode, longTitle }) {
    const f = window.__historyFixture;
    if (mode === 'long') f.data.games.games = f.data.games.games.map(g => ({ ...g, title: longTitle }));
    const inner = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args = {}) => {
        if (cmd === 'get_art') {
            if (mode === 'noart') return null;
            if (mode === 'broken') return 'data:image/jpeg;base64,AAAA';
            if (mode === 'slow') await new Promise(r => setTimeout(r, 1500));
            return args.kind === 'hero' ? (artMap[args.appId] ?? null) : null;
        }
        return inner(cmd, args);
    };
}

const browser = await chromium.launch();
const records = [];
async function openRin({ width, height, locale = 'en', theme = 'light', mode = 'art', scale = 1 }) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme, deviceScaleFactor: scale });
    await page.addInitScript(installHistoryFixture, { locale });
    await page.addInitScript(patchFixture, { art, mode, longTitle: LONG_TITLE });
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
async function metrics(page, label) {
    const m = await page.evaluate(() => {
        const root = document.querySelector('.app-root');
        const main = document.querySelector('main');
        const box = sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null; };
        const footer = box('main > .app-footer');
        return {
            innerWidth: window.innerWidth, innerHeight: window.innerHeight,
            docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            rootOverflow: root.scrollWidth > root.clientWidth,
            mainOverflow: main.scrollWidth > main.clientWidth,
            try: box('.rin-stage .mvp-btn.visit'), notNow: box('.rin-stage .mvp-btn.not-today'),
            art: box('.rin-art'), title: box('.rin-stage .game-label'), footer,
            titleText: document.querySelector('.rin-stage .game-label')?.textContent,
            artStatus: document.querySelector('.rin-art')?.dataset.artStatus,
        };
    });
    records.push({ label, ...m });
    assert(!m.docOverflow && !m.rootOverflow && !m.mainOverflow, `horizontal overflow: ${label}`);
    return m;
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

try {
    // 1. Overflow sweep: every width, both themes, 4 locales.
    for (const locale of ['en', 'zh-TW', 'zh-CN', 'ja']) {
        for (const theme of ['light', 'dark']) {
            for (const width of [320, 768, 1024, 1280, 1440, 1742, 1920]) {
                const page = await openRin({ width, height: 800, locale, theme });
                await metrics(page, `sweep ${locale} ${theme} ${width}`);
                await page.close();
            }
        }
    }

    // 2. Primary canvases: 1280x800 and 1280x720, en/zh-TW/ja, light+dark.
    for (const [w, h] of [[1280, 800], [1280, 720]]) {
        for (const locale of ['en', 'zh-TW', 'ja']) {
            for (const theme of ['light', 'dark']) {
                const page = await openRin({ width: w, height: h, locale, theme });
                const m = await metrics(page, `canvas ${w}x${h} ${locale} ${theme}`);
                assert(m.try.bottom <= h && m.notNow.bottom <= h, `actions above fold: ${w}x${h} ${locale} ${theme}`);
                assert(m.try.bottom <= m.footer.top + 1, `actions clear footer: ${w}x${h} ${locale} ${theme}`);
                await shot(page, `rin-${w}x${h}-${locale}-${theme}`);
                await page.close();
            }
        }
    }

    // 3. Desktop 1920 light, plus 1440.
    for (const w of [1440, 1920]) {
        const page = await openRin({ width: w, height: 1080 });
        await metrics(page, `desktop ${w}`);
        await shot(page, `rin-${w}x1080-en-light`);
        await page.close();
    }

    // 4. States: no art, media failed, long name, 200% zoom.
    for (const theme of ['light', 'dark']) {
        const page = await openRin({ width: 1280, height: 800, theme, mode: 'noart' });
        const m = await metrics(page, `no-art ${theme}`);
        assert.equal(m.artStatus, 'none');
        await shot(page, `state-no-art-${theme}`);
        await page.close();
    }
    {
        const page = await openRin({ width: 1280, height: 800, mode: 'broken' });
        const m = await metrics(page, 'media-failed');
        assert.equal(m.artStatus, 'failed');
        await shot(page, 'state-media-failed');
        await page.close();
    }
    for (const locale of ['en', 'ja']) {
        const page = await openRin({ width: 1280, height: 720, locale, mode: 'long' });
        const m = await metrics(page, `long-name ${locale}`);
        assert(m.titleText.includes('Every Chapter'), 'long title rendered in full');
        assert(m.try.bottom <= 720, 'actions above fold with long name');
        await shot(page, `state-long-name-${locale}`);
        await page.close();
    }
    for (const theme of ['light', 'dark']) {
        // 200% zoom of a 1280x800 window = 640x400 CSS px at DPR 2.
        const page = await openRin({ width: 640, height: 400, theme, scale: 2 });
        await metrics(page, `zoom200 ${theme}`);
        await shot(page, `state-zoom200-${theme}`);
        await page.locator('.app-root').evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.locator('main:has(> .mode-navigation)').evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.waitForTimeout(150);
        await shot(page, `state-zoom200-${theme}-scrolled`);
        await page.close();
    }

    // 5. Art box reserves space: same page, TRY position while art is still
    // loading vs after it lands (art delayed 1.5s by the fixture).
    {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
        await page.addInitScript(installHistoryFixture, { locale: 'en' });
        await page.addInitScript(patchFixture, { art, mode: 'slow', longTitle: LONG_TITLE });
        await page.goto(BASE);
        await page.locator('[data-face="rin"]').click();
        await page.locator('.rin-art[data-art-status="loading"]').waitFor();
        await page.evaluate(() => document.fonts.ready);
        const before = await page.locator('.rin-stage .mvp-btn.visit').boundingBox();
        await page.waitForFunction(() => document.querySelector('.rin-art')?.dataset.artStatus !== 'loading', null, { timeout: 5000 });
        await page.waitForTimeout(200);
        const after = await page.locator('.rin-stage .mvp-btn.visit').boundingBox();
        records.push({ label: 'reserve', before: before.y, after: after.y });
        assert(Math.abs(before.y - after.y) <= 1, `actions must not shift while art loads: ${before.y} vs ${after.y}`);
        await page.close();
    }

    // 6. Interaction states + state sheet (both themes).
    const crops = [];
    for (const theme of ['light', 'dark']) {
        const page = await openRin({ width: 1280, height: 800, theme });
        const rail = page.locator('main > .mode-navigation .mode-navigation__tabs');
        const clip = async (loc, name, pad = 10) => {
            const b = await loc.boundingBox();
            const file = `${SHOTS}/sheet-${theme}-${name}.png`;
            await page.screenshot({ path: file, clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 } });
            crops.push({ theme, name, file });
        };
        await page.mouse.move(1270, 790);
        await page.evaluate(() => document.activeElement?.blur());
        await clip(rail, 'mode-selected');
        await page.locator('[data-face="kamae"]').focus();
        await clip(rail, 'mode-focused');
        await page.locator('[data-face="rin"]').focus();
        await clip(rail, 'mode-selected-and-focused');
        await page.evaluate(() => document.activeElement?.blur());
        const maai = await page.locator('[data-face="maida2"]').boundingBox();
        await page.mouse.move(maai.x + 20, maai.y + maai.height / 2);
        await page.mouse.down();
        await clip(rail, 'mode-pressed');
        await page.mouse.move(1270, 790); // leave before release: no switch
        await page.mouse.up();
        const actions = page.locator('.rin-stage .action-row');
        await page.locator('.rin-stage .mvp-btn.visit').focus();
        await clip(actions, 'try-focused', 14);
        await page.locator('.rin-stage .mvp-btn.not-today').focus();
        await clip(actions, 'not-now-focused', 14);
        // Holding: pointer down on TRY for 1.5s (< 3s anchor), capture, cancel by leaving.
        const tryBox = await page.locator('.rin-stage .mvp-btn.visit').boundingBox();
        await page.mouse.move(tryBox.x + tryBox.width / 2, tryBox.y + tryBox.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(1500);
        await clip(actions, 'try-holding', 14);
        await shot(page, `state-holding-${theme}`);
        await page.mouse.move(1270, 790);
        await page.mouse.up();
        await page.waitForTimeout(200);
        // Undo window: NOT NOW, then the one-time Undo appears.
        await page.locator('.rin-stage .mvp-btn.not-today').click();
        await page.locator('.rin-stage .back-link:not(.is-hidden)').waitFor({ timeout: 5000 });
        await page.waitForTimeout(300);
        await metrics(page, `undo ${theme}`);
        await page.locator('.rin-stage .back-link').focus();
        await clip(actions, 'undo-focused', 14);
        await shot(page, `state-undo-${theme}`);
        await page.close();
    }
    const sheet = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const rows = await Promise.all(crops.map(async c => ({ ...c, data: (await readFile(c.file)).toString('base64') })));
    await sheet.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:24px;font:14px Inter,sans-serif;background:#888;color:#111}
      h1{font-size:18px;margin:0 0 16px} .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
      figure{margin:0;background:#fff;padding:8px} figcaption{margin-bottom:6px;font-weight:600}
      img{max-width:100%;display:block}</style>
      <h1>Rin P1 state sheet (1280x800; left light, right dark)</h1><div class="grid">
      ${['mode-selected', 'mode-focused', 'mode-selected-and-focused', 'mode-pressed', 'try-focused', 'not-now-focused', 'try-holding', 'undo-focused'].map(name =>
        ['light', 'dark'].map(theme => { const r = rows.find(x => x.name === name && x.theme === theme); return `<figure><figcaption>${name} / ${theme}</figcaption><img src="data:image/png;base64,${r.data}"></figure>`; }).join('')).join('')}
      </div>`);
    await sheet.screenshot({ path: `${OUT}/state-sheet.png`, fullPage: true });
    await sheet.close();

    await writeFile(`${OUT}/metrics.json`, JSON.stringify({ artNote, records }, null, 2));
    console.log(`rin-p1: ${records.length} layouts, no horizontal overflow; actions above fold at 1280x720; ${artNote}`);
} finally {
    await browser.close();
}
