// Proves in the real UI (not just pure-function unit tests) that closing
// Settings returns the user to the face F10/Menu opened it from, and that
// focus lands inside that face's view (not stranded on document.body).
// Covers: src/App.jsx handleSettingsClosed + src/core/settingsReturn.js,
// and src/views/KamaeView.jsx returnFocusFromSettings (kamae-source case).
//
// Matrix: source face (maida2 / rin / kamae) x close method (Esc, gamepad B,
// panel's own close button). For each case, asserts (1) the active mode
// after close equals the source mode, and (2) focus lands inside that
// mode's view.
//
// All nine cases are strict on both assertions. The kamae-source case used
// to leave focus on document.body (RETURNABLE_FACES never contains 'kamae',
// so handleSettingsClosed is a no-op for it); KamaeView now restores focus
// itself via returnFocusFromSettings when Settings closes without a face
// switch.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import assert from 'node:assert/strict';
import process from 'node:process';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5201';
const FACE_SELECTOR = { maida2: '.maida2-view', rin: '.mvp-container', kamae: '.kamae-view' };
const FACE_LABEL_PATTERN = { maida2: /Maai/, rin: /Rin/, kamae: /Kamae/ };
const BTN_B = 1;

const installPad = () => {
    window.__pad = { id: 'test-pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__pad] });
};

async function pressGamepadButton(page, index) {
    await page.evaluate(i => { window.__pad.buttons[i] = { pressed: true, value: 1 }; }, index);
    await page.waitForTimeout(90);
    await page.evaluate(i => { window.__pad.buttons[i] = { pressed: false, value: 0 }; }, index);
    await page.waitForTimeout(90);
}

async function newFixturePage(browser) {
    const page = await browser.newPage();
    await page.addInitScript(installHistoryFixture);
    await page.addInitScript(installPad);
    await page.goto(BASE);
    await page.locator('.mode-navigation').waitFor();
    return page;
}

async function switchToFace(page, face) {
    await page.locator(`[data-face="${face}"]`).click();
    await page.locator(FACE_SELECTOR[face]).waitFor();
}

async function openSettings(page) {
    // F10 opens Settings from any face (App.jsx keydown handler), borrowing
    // Kamae first when opened from Maida2/Rin. Consistent open method across
    // all cases isolates the variable under test to the CLOSE method.
    await page.keyboard.press('F10');
    await page.locator('.kamae-settings').waitFor();
}

// The settings panel's onBack (Esc / gamepad B) moves focus to its own
// back button on the FIRST press (announcing an SR hint) and only closes
// on a SECOND press once focus is already there (KamaeView.jsx handleBack).
// The panel's close button itself calls onClose directly, no double-press.
const CLOSE_METHODS = {
    esc: async (page) => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(60);
        await page.keyboard.press('Escape');
    },
    gamepadB: async (page) => {
        await pressGamepadButton(page, BTN_B);
        await page.waitForTimeout(60);
        await pressGamepadButton(page, BTN_B);
    },
    closeButton: async (page) => {
        await page.locator('.kamae-settings-back-btn').click();
    },
};

async function runCase(browser, sourceFace, methodName) {
    const page = await newFixturePage(browser);
    try {
        await switchToFace(page, sourceFace);
        await openSettings(page);
        await CLOSE_METHODS[methodName](page);
        await page.locator('.kamae-settings').waitFor({ state: 'detached' });
        await page.waitForTimeout(150);

        const activeLabel = await page.locator('.mode-navigation [aria-current="page"]').textContent();
        assert.match(activeLabel, FACE_LABEL_PATTERN[sourceFace],
            `[${sourceFace}/${methodName}] active mode after close should match source face, got "${activeLabel}"`);

        const focus = await page.evaluate(sel => {
            const el = document.querySelector(sel);
            return { tag: document.activeElement.tagName, contained: !!el && el.contains(document.activeElement) };
        }, FACE_SELECTOR[sourceFace]);

        assert.equal(focus.contained, true,
            `[${sourceFace}/${methodName}] focus should land inside ${FACE_SELECTOR[sourceFace]}, was on <${focus.tag}>`);
        return { sourceFace, methodName, modePass: true, focusContained: focus.contained, focusTag: focus.tag };
    } finally {
        await page.close();
    }
}

async function main() {
    const browser = await chromium.launch();
    const results = [];
    try {
        for (const sourceFace of ['maida2', 'rin', 'kamae']) {
            for (const methodName of Object.keys(CLOSE_METHODS)) {
                results.push(await runCase(browser, sourceFace, methodName));
            }
        }
    } finally {
        await browser.close();
    }

    console.log('\nsource  | close       | mode | focus-contained');
    console.log('--------|--------------|------|------------------');
    for (const r of results) {
        console.log(`${r.sourceFace.padEnd(7)} | ${r.methodName.padEnd(12)} | ${r.modePass ? 'PASS' : 'FAIL'} | ${String(r.focusContained).padEnd(16)}`);
    }

    console.log(`\nAll ${results.length} cases: mode-return AND focus-containment assertions passed. Gamepad B simulated via a mocked`);
    console.log('standard-mapping GamepadObject (window.__pad, navigator.getGamepads override) driving button index 1,');
    console.log('same pattern as e2e/history-gamepad-check.mjs — no physical controller involved.');
}

await main();
