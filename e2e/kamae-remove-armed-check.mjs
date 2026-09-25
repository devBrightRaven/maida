// P2 follow-up: (1) --m2-border contrast + prefers-contrast/forced-colors
// screenshots and token assertions, (2) the "confirm remove?" armed-row
// behaviour in Kamae's ShowcaseList (src/ui/features/Kamae/ShowcaseList.jsx)
// and its Esc/B disarm handling (src/views/KamaeView.jsx handleBack).
//
// Usage: dev server on 5197 (matches kamae-p2-check.mjs / rin-p1-check.mjs /
// bloom-motion-check.mjs), then `node e2e/kamae-remove-armed-check.mjs`.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5197';
const OUT = 'design/maida2-review/p2';
const SHOTS = `${OUT}/screens`;
await mkdir(SHOTS, { recursive: true });

const GAMES = [
    { id: 'g1', steamAppId: 1001, title: 'Alpha Quest', installed: true, score: 0, steamUrl: 'steam://rungameid/1001', steamLastPlayed: 0 },
    { id: 'g2', steamAppId: 1002, title: 'Beta Drift', installed: true, score: 0, steamUrl: 'steam://rungameid/1002', steamLastPlayed: 0 },
    { id: 'g3', steamAppId: 1003, title: 'Gamma Run', installed: true, score: 0, steamUrl: 'steam://rungameid/1003', steamLastPlayed: 0 },
];

// Runs in the page after installHistoryFixture. Single kata, 3 games, no art
// (get_art -> null, CapsuleThumb shows the quiet no-art surface) — no
// dependency on a local Steam library cache.
function patchFixture() {
    const f = window.__historyFixture;
    f.data.games.games = window.__E2E_GAMES__;
    let showcase = { games: [], box: [], katas: [{ id: 'k1', name: 'Test Kata', gameIds: window.__E2E_GAMES__.map(g => g.id) }], activeKataId: 'k1', exploreHistory: { lastSessionDate: null, cardsShownToday: 0 } };
    const inner = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args = {}) => {
        if (cmd === 'get_art') return null;
        if (cmd === 'get_showcase') return showcase;
        if (cmd === 'save_showcase') { showcase = args.data; return null; }
        if (cmd === 'search_warehouse') return [];
        return inner(cmd, args);
    };
}

const browser = await chromium.launch();

async function openKamae({ theme = 'light', pad = false, forcedColors, contrast, width = 1280, height = 800 } = {}) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme, forcedColors, contrast });
    page.on('pageerror', err => console.log('PAGEERROR', theme, err.message));
    await page.addInitScript(installHistoryFixture, { locale: 'en' });
    await page.addInitScript((games) => { window.__E2E_GAMES__ = games; }, GAMES);
    await page.addInitScript(patchFixture);
    // Isolation from a physical gamepad on the dev machine (same rationale
    // as kamae-p2-check.mjs): no pad unless explicitly requested, and the
    // requested pad is always the mocked one, never real hardware.
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
    await page.locator('[data-face="kamae"]').click();
    await page.locator('.showcase-item').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    return page;
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

// Focus + pointerdown/pointerup (no synthetic 'click') arms a row via the
// same <150ms fast-tap path real NVDA/mouse/gamepad-A users hit — see
// ShowcaseList.jsx handleEnd. dispatchEvent never fires a trailing native
// 'click', so onClick (which only acts while already confirming) can't
// double-fire, unlike a composite .click().
async function armRow(page, rowIndex = 0) {
    const btn = page.locator('.showcase-item').nth(rowIndex).locator('.showcase-hold-btn');
    await btn.focus();
    await btn.dispatchEvent('pointerdown');
    await btn.dispatchEvent('pointerup');
    await page.waitForTimeout(60);
    return btn;
}

const rowState = (page, rowIndex = 0) => page.evaluate((i) => {
    const row = document.querySelectorAll('.showcase-item')[i];
    const btn = row.querySelector('.showcase-hold-btn');
    const describedBy = btn.getAttribute('aria-describedby');
    const hint = describedBy ? document.getElementById(describedBy) : null;
    return {
        armed: btn.classList.contains('showcase-hold-btn--confirm'),
        label: btn.querySelector('.showcase-hold-label').textContent,
        focused: document.activeElement === btn,
        hintText: hint ? hint.textContent : null,
        hintIsArmedHint: hint ? hint.classList.contains('showcase-hold-hint') : false,
    };
}, rowIndex);

const anyArmed = (page) => page.evaluate(() => document.querySelectorAll('.showcase-hold-btn--confirm').length);

const tokenValue = (page, name) => page.evaluate((n) => window.getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

try {
    // ---- Part 1: contrast tokens + OS-preference screenshots ----
    for (const theme of ['light', 'dark']) {
        const page = await openKamae({ theme });
        const border = await tokenValue(page, '--m2-border');
        const expected = theme === 'dark' ? '#726552' : '#9a8462';
        assert.equal(border, expected, `--m2-border default (${theme})`);
        await page.close();
    }
    for (const theme of ['light', 'dark']) {
        const page = await openKamae({ theme, contrast: 'more' });
        const border = await tokenValue(page, '--m2-border');
        const muted = await tokenValue(page, '--m2-text-muted');
        const expectedBorder = theme === 'dark' ? '#93826a' : '#77674c';
        const expectedMuted = theme === 'dark' ? '#cbc6bc' : '#413c36';
        assert.equal(border, expectedBorder, `--m2-border prefers-contrast:more (${theme})`);
        assert.equal(muted, expectedMuted, `--m2-text-muted prefers-contrast:more (${theme})`);
        const outlineWidth = await page.evaluate(() => {
            const btn = document.querySelector('.showcase-hold-btn');
            btn.focus();
            return window.getComputedStyle(btn).outlineWidth;
        });
        assert.equal(outlineWidth, '4px', `focus ring thickened under prefers-contrast:more (${theme})`);
        await shot(page, `contrast-more-${theme}`);
        await page.close();
    }
    {
        const page = await openKamae({ theme: 'dark', forcedColors: 'active' });
        const border = await tokenValue(page, '--m2-border');
        assert.equal(border, 'CanvasText', '--m2-border under forced-colors');
        await armRow(page, 0);
        await page.waitForTimeout(60);
        await shot(page, 'forced-colors');
        await page.close();
    }

    // ---- Part 2: armed-row behaviour ----

    // Label + hint + aria-describedby + polite live-region wiring.
    {
        const page = await openKamae({ theme: 'light' });
        const before = await rowState(page, 0);
        assert.equal(before.armed, false, 'row starts unarmed');
        await armRow(page, 0);
        const armed = await rowState(page, 0);
        assert.equal(armed.armed, true, 'row arms on fast tap');
        assert.equal(armed.label, 'Confirm remove?', 'armed label text');
        assert.equal(armed.focused, true, 'button keeps focus while armed');
        assert.equal(armed.hintIsArmedHint, true, 'aria-describedby points at the visible .showcase-hold-hint element');
        assert.equal(armed.hintText, 'Press again to remove · Esc or B to cancel', 'armed hint text');
        await shot(page, 'remove-armed-light');
        await page.close();
    }
    {
        const page = await openKamae({ theme: 'dark' });
        await armRow(page, 0);
        await shot(page, 'remove-armed-dark');
        await page.close();
    }

    // Esc disarms only, keeps focus on the button (does not fall through to
    // "focus the active kata" — KamaeView.jsx handleBack).
    {
        const page = await openKamae({ theme: 'light' });
        await armRow(page, 0);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(60);
        const after = await rowState(page, 0);
        assert.equal(after.armed, false, 'Esc disarms');
        assert.equal(after.focused, true, 'focus stays on the button after Esc disarm');
        await page.close();
    }

    // Gamepad B disarms only, keeps focus on the button. B bypasses the
    // button's own onKeyDown entirely (useGameInput calls onBack directly),
    // so this exercises KamaeView's DOM-query fallback specifically.
    {
        const page = await openKamae({ theme: 'light', pad: true });
        await armRow(page, 0);
        await page.evaluate(() => { window.__pad.buttons[1] = { pressed: true, value: 1 }; });
        await page.waitForTimeout(90);
        await page.evaluate(() => { window.__pad.buttons[1] = { pressed: false, value: 0 }; });
        await page.waitForTimeout(90);
        const after = await rowState(page, 0);
        assert.equal(after.armed, false, 'gamepad B disarms');
        assert.equal(after.focused, true, 'focus stays on the button after gamepad-B disarm');
        await page.close();
    }

    // Esc layering: with nothing armed, Esc keeps the pre-existing behaviour
    // (focus moves to the active kata / all-games button), unchanged.
    {
        const page = await openKamae({ theme: 'light' });
        await page.locator('.showcase-item').first().locator('.showcase-hold-btn').focus();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(60);
        const active = await page.evaluate(() => {
            const el = document.activeElement;
            return el.matches('.kata-select-btn, [aria-pressed="true"]');
        });
        assert.equal(active, true, 'Esc with nothing armed still focuses the active kata (unchanged fallback)');
        await page.close();
    }

    // Pointer down outside the armed row disarms it.
    {
        const page = await openKamae({ theme: 'light' });
        await armRow(page, 0);
        await page.locator('.showcase-heading').dispatchEvent('pointerdown');
        await page.waitForTimeout(60);
        const after = await rowState(page, 0);
        assert.equal(after.armed, false, 'pointerdown outside the row disarms');
        await page.close();
    }

    // Focus leaving the armed button disarms it.
    {
        const page = await openKamae({ theme: 'light' });
        await armRow(page, 0);
        await page.locator('.showcase-item').nth(1).locator('.showcase-hold-btn').focus();
        await page.waitForTimeout(60);
        const after = await rowState(page, 0);
        assert.equal(after.armed, false, 'blur disarms the previously armed row');
        await page.close();
    }

    // Single-armed rule: arming another row disarms the first.
    {
        const page = await openKamae({ theme: 'light' });
        await armRow(page, 0);
        assert.equal(await anyArmed(page), 1, 'exactly one row armed');
        await armRow(page, 1);
        const [row0, row1] = await Promise.all([rowState(page, 0), rowState(page, 1)]);
        assert.equal(row0.armed, false, 'arming row 1 disarms row 0');
        assert.equal(row1.armed, true, 'row 1 is armed');
        assert.equal(await anyArmed(page), 1, 'still exactly one row armed');
        await page.close();
    }

    console.log('kamae-remove-armed-check: all assertions passed');
} finally {
    await browser.close();
}
