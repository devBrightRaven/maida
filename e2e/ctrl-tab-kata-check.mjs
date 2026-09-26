// Ctrl+Tab (rin <-> kamae pair, user ruling 2026-08-31) is routed through
// switchToRin/switchToKamae (2026-09-26 port) instead of a bare setFace, so
// that switching back to Rin runs reloadShowcase and actually picks up a
// kata change made while in Kamae. Proves: activate a different kata in
// Kamae, Ctrl+Tab back to Rin, the game on screen reflects the new kata's
// pool (not the stale one from before the switch).
// Usage: dev server up, then `E2E_BASE_URL=http://host:port node e2e/ctrl-tab-kata-check.mjs`.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import process from 'node:process';
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5197';

// Runs in the page after installHistoryFixture: two single-game katas, k1
// active. Each kata's one game makes the post-reroll pick deterministic
// without needing to also pin Math.random.
function patchFixture() {
    const f = window.__historyFixture;
    f.data.games.games = [
        { id: 'g1', steamAppId: 1, title: 'Kata One Game', installed: true, score: 0, steamUrl: 'steam://rungameid/1', steamLastPlayed: 0 },
        { id: 'g2', steamAppId: 2, title: 'Kata Two Game', installed: true, score: 0, steamUrl: 'steam://rungameid/2', steamLastPlayed: 0 },
    ];
    let showcase = {
        games: [], box: [],
        katas: [
            { id: 'k1', name: 'Kata One', gameIds: ['g1'] },
            { id: 'k2', name: 'Kata Two', gameIds: ['g2'] },
        ],
        activeKataId: 'k1',
        exploreHistory: { lastSessionDate: null, cardsShownToday: 0 },
    };
    const inner = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args = {}) => {
        if (cmd === 'get_showcase') return showcase;
        if (cmd === 'save_showcase') { showcase = args.data; return null; }
        if (cmd === 'get_art' || cmd === 'search_warehouse') return cmd === 'search_warehouse' ? [] : null;
        return inner(cmd, args);
    };
}

const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // Isolation: headless Chromium on this dev machine sees a physical
    // DualShock 4 controller — stub it out so no real input reaches the page.
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
    });
    await page.addInitScript(installHistoryFixture, { locale: 'en' });
    await page.addInitScript(patchFixture);
    await page.goto(BASE);

    // Start on Rin: kata one is active -> its one game shows.
    await page.locator('[data-face="rin"]').click();
    await page.locator('.rin-stage .mvp-btn.visit').waitFor();
    const initialTitle = await page.locator('.mvp-header .game-label').textContent();
    assert.match(initialTitle, /Kata One Game/, `Rin shows kata one's game before any switch: ${initialTitle}`);

    // Ctrl+Tab from Rin -> Kamae (the rin<->kamae pair).
    await page.keyboard.press('Control+Tab');
    await page.locator('.kamae-columns').waitFor();
    assert.equal(await page.evaluate(() => document.querySelector('main[class*="mvp-container"]')), null, 'left Rin for Kamae');

    // Activate kata two in Kamae.
    await page.locator('.kata-group .kata-select-btn').nth(1).click();
    await page.waitForFunction(() => {
        const groups = [...document.querySelectorAll('.kata-group')];
        return groups[1]?.classList.contains('kata-group--active');
    });

    // Ctrl+Tab from Kamae -> Rin (same pair, other direction) — must go
    // through switchToRin so reloadShowcase re-rolls against the new pool.
    await page.keyboard.press('Control+Tab');
    await page.locator('.rin-stage .mvp-btn.visit').waitFor();
    await page.waitForFunction(() => document.querySelector('.mvp-header .game-label')?.textContent?.includes('Kata Two Game'));
    const finalTitle = await page.locator('.mvp-header .game-label').textContent();
    assert.match(finalTitle, /Kata Two Game/, `Rin reflects the kata activated in Kamae after Ctrl+Tab back: ${finalTitle}`);

    console.log('ctrl-tab-kata-check: Ctrl+Tab (rin<->kamae) routes through switchToRin/switchToKamae — a kata change made in Kamae is applied on the way back to Rin.');
} finally {
    await browser.close();
}
