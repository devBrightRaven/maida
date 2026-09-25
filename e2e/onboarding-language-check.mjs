// Proves the first-run onboarding language-choice step (BUG-009 follow-up)
// in the real UI: preselect follows navigator.language, changing selection
// updates onboarding UI language immediately, Continue reaches the existing
// sync step, the choice survives a reload, and both keyboard-only and
// mocked-gamepad paths can operate the whole step.
// Usage: dev server up, then `E2E_BASE_URL=http://host:port node e2e/onboarding-language-check.mjs`.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import process from 'node:process';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5199';
const OUT = 'design/maida2-review/p3/screens';
await mkdir(OUT, { recursive: true });

const DPAD = { up: 12, down: 13, left: 14, right: 15 };
const BTN_A = 0;

// Browser-only IPC fixture. Never connected to the user's Tauri data
// directory. `get_data` returns null for every key so `games` is null and
// isFirstRun() is true — the app lands on the onboarding screen.
function installOnboardingFixture({ storedLocale, theme } = {}) {
    if (storedLocale) localStorage.setItem('maida_locale', storedLocale);
    if (theme) localStorage.setItem('maida-theme', theme);
    window.__TAURI_INTERNALS__ = {
        transformCallback: () => 1,
        invoke: async (cmd) => {
            if (cmd === 'check_steam_available') return { available: true };
            if (cmd === 'get_showcase') return { games: [], box: [], katas: [], activeKataId: null, exploreHistory: { lastSessionDate: null, cardsShownToday: 0 } };
            return null; // get_data (games/anchor/returnPenalties/constraints) etc.
        },
    };
}

function installNavigatorLanguage({ tag, languages }) {
    Object.defineProperty(navigator, 'language', { configurable: true, get: () => tag });
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => languages || (tag ? [tag] : []) });
}

async function openOnboarding(browser, { navLang, navLanguages, storedLocale, theme, pad = false, viewport, forcedColors } = {}) {
    const page = await browser.newPage({ ...(viewport ? { viewport } : {}), ...(forcedColors ? { forcedColors } : {}) });
    page.on('pageerror', err => console.log('PAGEERROR', err.message));
    await page.addInitScript(installOnboardingFixture, { storedLocale, theme });
    if (navLang) await page.addInitScript(installNavigatorLanguage, { tag: navLang, languages: navLanguages });
    // Isolation from any physical controller attached to the test machine —
    // same reasoning as e2e/kamae-p2-check.mjs.
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
    });
    if (pad) {
        await page.addInitScript(() => {
            window.__pad = { id: 'test-pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
            Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__pad] });
        });
    }
    await page.goto(BASE);
    await page.locator('.onboarding-language-fieldset').waitFor();
    return page;
}

async function pressPad(page, index) {
    await page.evaluate(i => { window.__pad.buttons[i] = { pressed: true, value: 1 }; }, index);
    await page.waitForTimeout(90);
    await page.evaluate(i => { window.__pad.buttons[i] = { pressed: false, value: 0 }; }, index);
    await page.waitForTimeout(90);
}

// Language option buttons now also carry an aria-hidden checkmark glyph
// (review 2026-09-26 P3 R1); .onboarding-language-label is the visible text,
// excluding that marker, so these helpers keep comparing against plain
// language names instead of "✓English".
const focusedText = (page) => page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const label = el.querySelector('.onboarding-language-label');
    return label ? label.textContent : (el.textContent ?? null);
});
const focusedClass = (page) => page.evaluate(() => document.activeElement?.className ?? '');
const pressedLabel = (page) => page.locator('.onboarding-language-option[aria-pressed="true"] .onboarding-language-label').textContent();

const results = [];
function record(name, fn) {
    return fn().then(() => { results.push({ name, pass: true }); })
        .catch(err => { results.push({ name, pass: false, err }); throw err; });
}

async function main() {
    const browser = await chromium.launch();
    try {
        // 1. Preselect follows navigator.language, script-aware (BUG-009).
        await record('preselect zh-Hans-CN -> 简体中文', async () => {
            const page = await openOnboarding(browser, { navLang: 'zh-Hans-CN' });
            try {
                const label = await pressedLabel(page);
                assert.equal(label, '简体中文', `expected 简体中文 preselected, got "${label}"`);
                const count = await page.locator('.onboarding-language-option[aria-pressed="true"]').count();
                assert.equal(count, 1, 'exactly one option should be pressed');
            } finally { await page.close(); }
        });

        await record('preselect ja-JP -> 日本語', async () => {
            const page = await openOnboarding(browser, { navLang: 'ja-JP' });
            try {
                const label = await pressedLabel(page);
                assert.equal(label, '日本語', `expected 日本語 preselected, got "${label}"`);
            } finally { await page.close(); }
        });

        // 2. Selecting changes visible onboarding text immediately.
        await record('selecting changes visible onboarding text', async () => {
            const page = await openOnboarding(browser, { navLang: 'en-US' });
            try {
                const before = await page.locator('#onboarding-language-title').textContent();
                assert.equal(before, 'Choose your language');
                await page.locator('.onboarding-language-option', { hasText: '繁體中文' }).click();
                await page.waitForTimeout(150); // App.jsx localeVersion remount
                await page.locator('.onboarding-language-fieldset').waitFor();
                const after = await page.locator('#onboarding-language-title').textContent();
                assert.equal(after, '選擇你的語言', `legend should switch to zh-TW text, got "${after}"`);
                const continueText = await page.locator('.onboarding-language-continue').textContent();
                assert.equal(continueText, '繼續');
            } finally { await page.close(); }
        });

        // 3. Continue reaches the existing sync step.
        await record('Continue reaches the existing sync step', async () => {
            const page = await openOnboarding(browser, { navLang: 'en-US' });
            try {
                await page.locator('.onboarding-language-continue').click();
                await page.locator('.onboarding-link').waitFor();
                const fieldsetCount = await page.locator('.onboarding-language-fieldset').count();
                assert.equal(fieldsetCount, 0, 'language fieldset should be gone after Continue');
                const syncText = await page.locator('.onboarding-link').textContent();
                assert.equal(syncText, 'Scan my game library');
            } finally { await page.close(); }
        });

        // 4. Reload keeps the choice (existing setLocale/localStorage persistence).
        await record('reload keeps the choice', async () => {
            const page = await openOnboarding(browser, { navLang: 'en-US' });
            try {
                await page.locator('.onboarding-language-option', { hasText: '日本語' }).click();
                await page.waitForTimeout(150);
                await page.locator('.onboarding-language-fieldset').waitFor();
                await page.reload();
                await page.locator('.onboarding-language-fieldset').waitFor();
                const label = await pressedLabel(page);
                assert.equal(label, '日本語', `reload should keep the selected locale, got "${label}"`);
                const stored = await page.evaluate(() => localStorage.getItem('maida_locale'));
                assert.equal(stored, 'ja');
            } finally { await page.close(); }
        });

        // 5. Keyboard-only path: arrow keys move focus, Enter selects/continues.
        await record('keyboard-only path', async () => {
            const page = await openOnboarding(browser, { navLang: 'en-US' });
            try {
                const initial = await focusedText(page);
                assert.equal(initial, 'English', 'mount focus should land on the preselected option');
                await page.keyboard.press('ArrowRight');
                const afterRight = await focusedText(page);
                assert.equal(afterRight, '日本語', 'ArrowRight should move focus to the next option');
                await page.keyboard.press('Enter');
                await page.waitForTimeout(150);
                await page.locator('.onboarding-language-fieldset').waitFor();
                const label = await pressedLabel(page);
                assert.equal(label, '日本語', 'Enter on a focused option should select it');
                await page.keyboard.press('ArrowRight');
                await page.keyboard.press('ArrowRight');
                await page.keyboard.press('ArrowRight');
                const cls = await focusedClass(page);
                assert.ok(cls.includes('onboarding-language-continue'), `arrow navigation should reach Continue, focus class was "${cls}"`);
                await page.keyboard.press('Enter');
                await page.locator('.onboarding-link').waitFor();
            } finally { await page.close(); }
        });

        // 6. Mocked-gamepad path: D-pad moves focus, A selects/continues.
        await record('mocked-gamepad path', async () => {
            const page = await openOnboarding(browser, { navLang: 'en-US', pad: true });
            try {
                await pressPad(page, DPAD.right);
                const afterRight = await focusedText(page);
                assert.equal(afterRight, '日本語', 'D-pad right should move focus to the next option');
                await pressPad(page, BTN_A);
                await page.waitForTimeout(150);
                await page.locator('.onboarding-language-fieldset').waitFor();
                const label = await pressedLabel(page);
                assert.equal(label, '日本語', 'gamepad A on a focused option should select it');
                await pressPad(page, DPAD.right);
                await pressPad(page, DPAD.right);
                await pressPad(page, DPAD.right);
                const cls = await focusedClass(page);
                assert.ok(cls.includes('onboarding-language-continue'), `D-pad navigation should reach Continue, focus class was "${cls}"`);
                await pressPad(page, BTN_A);
                await page.locator('.onboarding-link').waitFor();
            } finally { await page.close(); }
        });

        // 7. Review 2026-09-26 P3 R1: forced-colors strips the selected
        // option's box-shadow/tint, and once focus moves away the focus
        // outline is gone too — only the checkmark marker is left to show
        // which option is selected.
        await record('forced-colors: selected option keeps a non-color marker after focus moves away', async () => {
            const page = await openOnboarding(browser, { navLang: 'en-US', viewport: { width: 320, height: 720 }, forcedColors: 'active' });
            try {
                // Mount focus lands on English (index 0 of 4 options); 4
                // ArrowRights walk past the remaining 3 options to Continue.
                await page.keyboard.press('ArrowRight');
                await page.keyboard.press('ArrowRight');
                await page.keyboard.press('ArrowRight');
                await page.keyboard.press('ArrowRight');
                const cls = await focusedClass(page);
                assert.ok(cls.includes('onboarding-language-continue'), `focus should have moved to Continue, was "${cls}"`);

                const selected = page.locator('.onboarding-language-option[aria-pressed="true"]');
                assert.equal(await selected.locator('.onboarding-language-label').textContent(), 'English', 'English should still be the selected option');
                const others = page.locator('.onboarding-language-option[aria-pressed="false"]');

                const selectedCheckVisibility = await selected.locator('.onboarding-language-check').evaluate(el => window.getComputedStyle(el).visibility);
                assert.equal(selectedCheckVisibility, 'visible', 'selected option marker must be visible under forced-colors, focus elsewhere');

                const otherCount = await others.count();
                assert.ok(otherCount > 0, 'expected unselected language options to exist');
                for (let i = 0; i < otherCount; i++) {
                    const vis = await others.nth(i).locator('.onboarding-language-check').evaluate(el => window.getComputedStyle(el).visibility);
                    assert.equal(vis, 'hidden', `unselected option ${i} must not show the marker`);
                }
            } finally { await page.close(); }
        });

        // 8. Screenshots.
        for (const theme of ['light', 'dark']) {
            const page = await openOnboarding(browser, { navLang: 'en-US', theme, viewport: { width: 1280, height: 800 } });
            await page.waitForTimeout(150);
            await page.screenshot({ path: `${OUT}/onboarding-language-${theme}.png` });
            await page.close();
        }
    } finally {
        await browser.close();
    }

    console.log('\ncheck                                          | result');
    console.log('------------------------------------------------|-------');
    for (const r of results) console.log(`${r.name.padEnd(47)} | ${r.pass ? 'PASS' : 'FAIL'}`);
    console.log(`\nAll ${results.length} checks passed. Screenshots: ${OUT}/onboarding-language-{light,dark}.png`);
}

await main();
