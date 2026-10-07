// R1/R2 regression (Codex WIP port review 2026-10-07): the active kata bounds
// which game Rin can show. An old Undo must never bring back a game outside
// the current pool, and the behavioral debug trace must not keep a previous
// round once the pool has no candidates.
// Cases: skip in k1 -> empty k2 (empty state persists, Undo unavailable, the
// back handler itself cannot restore g1, no undo/later choice event for g1);
// A->B kata switch drops cross-pool undo; empty -> non-empty shows a game;
// unchanged pool keeps the game AND its Undo; CLEAR (unanchor) keeps the game
// and anchor blocks reloadShowcase.
// Usage: dev server up, then `E2E_BASE_URL=http://host:port node e2e/kata-undo-pool-check.mjs`.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import process from 'node:process';
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5197';

function patchFixture() {
    const f = window.__historyFixture;
    f.data.games.games = Array.from({ length: 8 }, (_, i) => ({ id: `g${i + 1}`, steamAppId: i + 1, title: `Game ${i + 1}`, installed: true, score: 0, steamUrl: `steam://rungameid/${i + 1}`, steamLastPlayed: 0 }));
    const showcase = {
        games: [], box: [],
        katas: [
            { id: 'k1', name: 'One', gameIds: ['g1'] },
            { id: 'k2', name: 'Empty', gameIds: [] },
            { id: 'k3', name: 'Three', gameIds: ['g2'] },
            { id: 'k4', name: 'Many', gameIds: ['g3', 'g4', 'g5', 'g6', 'g7', 'g8'] },
        ],
        activeKataId: 'k1',
        exploreHistory: { lastSessionDate: null, cardsShownToday: 0 },
    };
    window.__setActiveKata = (id) => { showcase.activeKataId = id; };
    const inner = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args = {}) => {
        if (cmd === 'get_showcase') return showcase;
        if (cmd === 'get_art') return null;
        if (cmd === 'search_warehouse') return [];
        return inner(cmd, args);
    };
}

const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // Isolation: stub the physical DualShock 4 seen by headless Chromium.
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
    });
    await page.addInitScript(installHistoryFixture, { locale: 'en' });
    await page.addInitScript(patchFixture);
    await page.goto(BASE);
    await page.locator('[data-face="rin"]').click();
    await page.locator('main.mvp-container').waitFor();

    const title = async () => ((await page.locator('.mvp-header .game-label').textContent().catch(() => null)) ?? '').replace(/^.*?(Game \d+).*$/, '$1');
    const hasGame = async () => (await page.locator('.mvp-header .game-label').count()) > 0;
    const undoVisible = () => page.evaluate(() => { const b = document.querySelector('.back-link'); return !!b && !b.classList.contains('is-hidden') && !b.disabled; });
    const trace = () => page.evaluate(async () => (await import('/src/core/debugStore.js')).debugStore.getTrace());
    const events = () => page.evaluate(() => window.__historyFixture.events.filter(e => e.eventType === 'maida.choice.recorded').map(e => ({ id: e.subject.id, action: e.payload.action })));
    // Invoke the session's handleAction directly (bypasses the view's own
    // canUndo guard) through the onAction prop found on the React fiber.
    const callAction = async (type) => {
        await page.evaluate((t) => {
            const node = document.querySelector('main.mvp-container');
            const key = Object.keys(node).find(k => k.startsWith('__reactFiber$'));
            let fiber = node[key];
            while (fiber && !(fiber.memoizedProps && typeof fiber.memoizedProps.onAction === 'function')) fiber = fiber.return;
            if (!fiber) throw new Error('onAction not found on fiber');
            fiber.memoizedProps.onAction(t);
        }, type);
        await page.waitForTimeout(250);
    };
    const toRin = async (kataId) => {
        await page.keyboard.press('Control+Tab');
        await page.locator('.kamae-columns').waitFor();
        await page.evaluate((id) => window.__setActiveKata(id), kataId);
        await page.keyboard.press('Control+Tab');
        await page.locator('main.mvp-container').waitFor();
        await page.waitForTimeout(300);
    };
    const roundTrip = async () => {
        await page.keyboard.press('Control+Tab');
        await page.locator('.kamae-columns').waitFor();
        await page.keyboard.press('Control+Tab');
        await page.locator('main.mvp-container').waitFor();
        await page.waitForTimeout(250);
    };

    // --- Case 1: k1=[g1] skip -> empty k2 -> back to Rin ---
    await page.locator('.rin-stage .mvp-btn.visit').waitFor();
    assert.match(await title(), /Game 1/, 'k1 shows g1');
    await page.locator('.rin-stage .mvp-btn.not-today').click();
    await page.waitForTimeout(300);
    assert.match(await title(), /Game 1/, 'single-game pool soft-resets to g1');
    assert.equal(await undoVisible(), true, 'Undo available after a skip within the pool');
    await toRin('k2');
    await page.locator('[data-empty-kata="true"]').waitFor();
    assert.equal(await hasGame(), false, 'empty kata: no game');
    assert.equal(await undoVisible(), false, 'empty kata: Undo not available');
    const t1 = await trace();
    assert.equal(t1.selected, null, 'debug trace selected cleared on empty pool');
    assert.deepEqual(t1.candidates, [], 'debug trace candidates cleared on empty pool');
    const before = await events();
    await callAction('back');
    assert.equal(await hasGame(), false, 'back handler cannot restore g1 into the empty pool');
    await page.locator('[data-empty-kata="true"]').waitFor();
    const after = await events();
    assert.deepEqual(after, before, 'no undo / later choice event emitted by the refused back');
    assert.equal(after.filter(e => e.action === 'undo').length, 0, 'no undo event in Decision Trace');
    await callAction('skip'); // idle skip must not surface g1 either
    assert.equal(await hasGame(), false, 'empty pool still empty after idle skip');

    // --- Case 2: empty -> non-empty shows a game ---
    await toRin('k3');
    await page.locator('.rin-stage .mvp-btn.visit').waitFor();
    assert.match(await title(), /Game 2/, 'empty -> non-empty shows the new pool game');
    assert.equal(await undoVisible(), false, 'no Undo after pool change');

    // --- Case 3: A->B drops cross-pool undo ---
    await toRin('k1');
    await page.locator('.rin-stage .mvp-btn.not-today').click();
    await page.waitForTimeout(300);
    assert.equal(await undoVisible(), true, 'Undo available in k1');
    await toRin('k3');
    assert.match(await title(), /Game 2/, 'A->B shows B game');
    assert.equal(await undoVisible(), false, 'A->B drops Undo');
    const before3 = await events();
    await callAction('back');
    assert.match(await title(), /Game 2/, 'back cannot restore g1 into k3');
    assert.deepEqual(await events(), before3, 'no undo event for cross-pool back');

    // --- Case 4: unchanged pool keeps the game and its Undo ---
    await toRin('k4');
    await page.locator('.rin-stage .mvp-btn.not-today').click();
    await page.waitForTimeout(300);
    const skippedTo = await title();
    assert.equal(await undoVisible(), true, 'Undo available after skip in k4');
    for (let i = 0; i < 8; i++) {
        await roundTrip();
        assert.equal(await title(), skippedTo, `unchanged pool does not re-roll (round trip ${i + 1})`);
    }
    assert.equal(await undoVisible(), true, 'unchanged pool keeps Undo');
    await callAction('back');
    assert.notEqual(await title(), skippedTo, 'in-pool Undo still restores the previous game');
    assert.equal((await events()).filter(e => e.action === 'undo').length, 1, 'exactly one undo event, in-pool');

    // --- Case 5: anchor blocks reloadShowcase; CLEAR keeps the game ---
    const anchored = await title();
    await callAction('anchor');
    await toRin('k3');
    assert.equal(await title(), anchored, 'anchored game survives a kata switch');
    await callAction('release');
    assert.equal(await title(), anchored, 'CLEAR keeps the current game');
    assert.equal(await undoVisible(), false, 'no Undo after CLEAR');

    console.log('kata-undo-pool-check: empty/other-kata switch invalidates Undo, back handler refuses out-of-pool restore (no undo event), empty->non-empty shows game, unchanged pool keeps game+Undo, anchor/CLEAR keep game, debug trace cleared on empty pool.');
} finally {
    await browser.close();
}
