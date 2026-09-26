// Empty kata = empty pool (2026-09-26 port decision): an active kata with
// zero games resolves to candidatePool [] (resolveActiveKataGameIds), so
// Rin gets no game and shows a calm, text-only empty-kata message instead
// of the generic idle prescription. Asserts: no game rendered, no TRY/NOT
// NOW buttons, no fake art, the localized empty-kata message shows (all 4
// locales), and the existing mode navigation still reaches Kamae.
// Usage: dev server up, then `E2E_BASE_URL=http://host:port node e2e/rin-empty-kata-check.mjs`.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import process from 'node:process';
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5197';

const EXPECTED_MESSAGE = {
    en: 'This kata has no games yet. Add games in Kamae, or choose another kata.',
    'zh-TW': '這個型還沒有遊戲。到 Kamae 加入遊戲，或選擇其他型。',
    'zh-CN': '这个型还没有游戏。到 Kamae 加入游戏，或选择其他型。',
    ja: 'この型にはまだゲームがありません。Kamae でゲームを追加するか、別の型を選んでください。',
};

// Runs in the page after installHistoryFixture: seed an active kata with
// zero games (empty pool, not "no active kata").
function patchFixture() {
    const showcase = { games: [], box: [], katas: [{ id: 'k1', name: 'Empty kata', gameIds: [] }], activeKataId: 'k1', exploreHistory: { lastSessionDate: null, cardsShownToday: 0 } };
    const inner = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args = {}) => {
        if (cmd === 'get_showcase') return showcase;
        if (cmd === 'get_art') return null;
        return inner(cmd, args);
    };
}

const browser = await chromium.launch();
const records = [];

async function openRinEmptyKata({ locale = 'en' } = {}) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // Isolation: headless Chromium on this dev machine sees a physical
    // DualShock 4 controller — stub it out so no real input reaches the page.
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
    });
    await page.addInitScript(installHistoryFixture, { locale });
    await page.addInitScript(patchFixture);
    await page.goto(BASE);
    await page.locator('[data-face="rin"]').click();
    await page.locator('main.mvp-container').waitFor();
    await page.locator('[data-empty-kata="true"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    return page;
}

try {
    for (const locale of ['en', 'zh-TW', 'zh-CN', 'ja']) {
        const page = await openRinEmptyKata({ locale });

        const info = await page.evaluate(() => ({
            isIdle: !!document.querySelector('main.mvp-container.is-idle'),
            gameLabelCount: document.querySelectorAll('.mvp-header .game-label').length,
            tryBtnCount: document.querySelectorAll('.rin-stage .mvp-btn.visit').length,
            notNowBtnCount: document.querySelectorAll('.rin-stage .mvp-btn.not-today').length,
            artBoxCount: document.querySelectorAll('.rin-art').length,
            imgCount: document.querySelectorAll('.rin-stage img').length,
            message: document.querySelector('[data-empty-kata="true"] .permission-text')?.textContent,
            navToKamae: !!document.querySelector('.mode-navigation [data-face="kamae"]'),
        }));

        assert.equal(info.isIdle, true, `Rin container is idle (no game): ${locale}`);
        assert.equal(info.gameLabelCount, 0, `no game title rendered: ${locale}`);
        assert.equal(info.tryBtnCount, 0, `TRY not actionable without a game: ${locale}`);
        assert.equal(info.notNowBtnCount, 0, `NOT NOW not actionable without a game: ${locale}`);
        assert.equal(info.artBoxCount, 0, `no fake art rendered: ${locale}`);
        assert.equal(info.imgCount, 0, `no img at all: ${locale}`);
        assert.equal(info.message, EXPECTED_MESSAGE[locale], `empty-kata message text: ${locale}`);
        assert.equal(info.navToKamae, true, `mode navigation still offers a way to Kamae: ${locale}`);

        records.push({ label: locale, ...info });
        await page.close();
    }

    console.log(`rin-empty-kata-check: ${records.length} locales passed; active-but-empty kata shows no game, no TRY/NOT NOW, no fake art, the localized empty-kata message, and mode navigation still reaches Kamae.`);
} finally {
    await browser.close();
}
