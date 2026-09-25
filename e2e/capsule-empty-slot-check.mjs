// Integration proof for the empty-capsule-slot marker (review 2026-09-26,
// item 4: CapsuleThumb.jsx kamae-capsule--none/--failed, KamaeView.css).
// Shows empty slots next to real local Steam capsule art in both a kata
// card (CapsuleStrip) and the game list (ShowcaseList) — same layout used by
// e2e/kamae-p2-check.mjs, deliberately forcing a subset of games to "no art"
// so both states are visible side by side regardless of which appIds the
// local machine's library cache happens to have.
// Usage: dev server up, then `E2E_BASE_URL=http://host:port node e2e/capsule-empty-slot-check.mjs`.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5197';
const SHOTS = 'design/maida2-review/p3/screens';
await mkdir(SHOTS, { recursive: true });

// Same catalog as kamae-p2-check.mjs (real appIds likely to have local
// capsule art on a dev machine with Steam installed).
const CATALOG = [
    [367520, 'Hollow Knight'], [413150, 'Stardew Valley'], [1145360, 'Hades'], [504230, 'Celeste'],
    [646570, 'Slay the Spire'], [620, 'Portal 2'], [292030, 'The Witcher 3: Wild Hunt'], [1086940, "Baldur's Gate 3"],
];

const LIBRARY = process.env.STEAM_LIBRARYCACHE || 'C:/Program Files (x86)/Steam/appcache/librarycache';
async function findCapsule(appId) {
    const dir = path.join(LIBRARY, String(appId));
    if (!existsSync(dir)) return null;
    for (const name of ['library_capsule.jpg', 'library_600x900.jpg']) {
        const direct = path.join(dir, name);
        if (existsSync(direct)) return direct;
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const nested = path.join(dir, entry.name, name);
            if (entry.isDirectory() && existsSync(nested)) return nested;
        }
    }
    return null;
}

const art = {};
for (const [appId] of CATALOG) {
    const file = await findCapsule(appId);
    if (file) art[appId] = `data:image/jpeg;base64,${(await readFile(file)).toString('base64')}`;
}
const foundCount = Object.keys(art).length;

// Force half the catalog to "no art" regardless of what the local cache has,
// so the empty-slot marker is always visible next to a real capsule (the
// scenario the review asked to see), never dependent on cache contents.
const NO_ART_APPIDS = new Set(CATALOG.filter((_, i) => i % 2 === 1).map(([appId]) => appId));

function patchFixture({ art: artMap, noArtIds, games, katas, activeKataId }) {
    const f = window.__historyFixture;
    f.data.games.games = games;
    let showcase = { games: [], box: [], katas, activeKataId, exploreHistory: { lastSessionDate: null, cardsShownToday: 0 } };
    const inner = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args = {}) => {
        if (cmd === 'get_art') {
            if (args.kind !== 'capsule') return null;
            if (noArtIds.includes(args.appId)) return null;
            return artMap[args.appId] ?? null;
        }
        if (cmd === 'get_showcase') return showcase;
        if (cmd === 'save_showcase') { showcase = args.data; return null; }
        if (cmd === 'search_warehouse') return [];
        return inner(cmd, args);
    };
}

const games = CATALOG.map(([appId, title], i) => ({ id: `g${i + 1}`, steamAppId: appId, title, installed: true, score: 0, steamUrl: `steam://rungameid/${appId}`, steamLastPlayed: 0 }));
const katas = [{ id: 'k1', name: 'Before bed', gameIds: games.slice(0, 6).map(g => g.id) }];

const browser = await chromium.launch();
try {
    for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
        page.on('pageerror', err => console.log('PAGEERROR', theme, err.message));
        await page.addInitScript(installHistoryFixture, { locale: 'en' });
        await page.addInitScript(patchFixture, { art, noArtIds: [...NO_ART_APPIDS], games, katas, activeKataId: 'k1' });
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
        });
        await page.goto(BASE);
        await page.locator('[data-face="kamae"]').click();
        await page.locator('.kamae-columns').waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('.kamae-capsule')].every(el => el.dataset.artStatus !== 'loading'));
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);

        // Assert both states are actually present before trusting the screenshot.
        const statuses = await page.evaluate(() => [...document.querySelectorAll('.kamae-capsule')].map(el => el.dataset.artStatus));
        assert(statuses.includes('ready'), `${theme}: expected at least one ready capsule, got ${JSON.stringify(statuses)}`);
        assert(statuses.includes('none'), `${theme}: expected at least one empty (none) capsule, got ${JSON.stringify(statuses)}`);

        // The marker (pseudo-element corner marks) renders only for none/
        // failed, never for ready — confirms the CSS scoping, not just that
        // a screenshot exists.
        const markerCheck = await page.evaluate(() => {
            const out = [];
            for (const el of document.querySelectorAll('.kamae-capsule')) {
                const before = window.getComputedStyle(el, '::before');
                out.push({ status: el.dataset.artStatus, hasMarker: before.content !== 'none' && before.borderTopWidth !== '0px' });
            }
            return out;
        });
        for (const { status, hasMarker } of markerCheck) {
            if (status === 'none' || status === 'failed') {
                assert.equal(hasMarker, true, `${theme}: ${status} capsule should show the empty-slot marker`);
            } else {
                assert.equal(hasMarker, false, `${theme}: ${status} capsule should NOT show the empty-slot marker`);
            }
        }

        await page.screenshot({ path: `${SHOTS}/capsule-empty-${theme}.png` });
        await page.close();
    }
    console.log(`capsule-empty-slot: local capsule art for ${foundCount}/${CATALOG.length} fixture games; both themes screenshot empty slots next to real capsules in the kata card and game list; marker CSS scoping confirmed (none/failed only).`);
} finally {
    await browser.close();
}
