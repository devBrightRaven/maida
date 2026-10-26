// Rin anchored state + Maai zone label: assertions and screenshots.
// Browser-only fixture. Usage: dev server on 5201, then `node e2e/rin-anchored-check.mjs`.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5201';
const SHOTS = 'design/maida2-review/p5/screens';
await mkdir(SHOTS, { recursive: true });
const LIBRARY = process.env.STEAM_LIBRARYCACHE || 'C:/Program Files (x86)/Steam/appcache/librarycache';
let heroUrl = null;
const dir = path.join(LIBRARY, '367520');
if (existsSync(dir)) {
    const direct = path.join(dir, 'library_hero.jpg');
    let file = existsSync(direct) ? direct : null;
    for (const e of file ? [] : await readdir(dir, { withFileTypes: true })) {
        const n = path.join(dir, e.name, 'library_hero.jpg');
        if (e.isDirectory() && existsSync(n)) { file = n; break; }
    }
    if (file) heroUrl = `data:image/jpeg;base64,${(await readFile(file)).toString('base64')}`;
}
console.log(heroUrl ? 'local hero art for 367520' : 'no local hero art: screenshots show the no-art state');

function patch({ hero }) {
    navigator.getGamepads = () => [null, null, null, null];
    const f = window.__historyFixture;
    f.data.anchor = { isAnchored: true, gameId: 'g1' };
    const inner = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args = {}) => {
        if (cmd === 'get_art') return args.kind === 'hero' ? hero : null;
        return inner(cmd, args);
    };
}
const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: theme });
    await page.addInitScript(installHistoryFixture, { locale: 'en' });
    await page.addInitScript(patch, { hero: heroUrl });
    await page.goto(BASE);
    await page.locator('[data-face="rin"]').click();
    await page.locator('.rin-stage .mvp-btn.visit').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    const r = await page.evaluate(() => {
        const h1 = document.querySelector('.rin-stage h1.game-label');
        const glow = [...document.querySelectorAll('.rin-stage *')].filter(el => {
            const s = window.getComputedStyle(el).boxShadow;
            return s.includes('30px');
        }).map(el => el.className);
        const badge = document.querySelector('.rin-anchored-badge');
        const kata = window.getComputedStyle(badge);
        return {
            h1: h1.textContent,
            srWords: [...h1.querySelectorAll('.sr-only')].map(e => e.textContent),
            badge: badge.textContent, badgeNext: badge.nextElementSibling === h1,
            badgeStyle: { color: kata.color, size: kata.fontSize, weight: kata.fontWeight, ls: kata.letterSpacing, tt: kata.textTransform },
            anchoredBtn: document.querySelectorAll('.anchored-btn').length,
            glow,
            play: document.querySelector('.rin-stage .mvp-btn.visit').textContent,
            playBg: window.getComputedStyle(document.querySelector('.rin-stage .mvp-btn.visit')).backgroundColor,
            accent: window.getComputedStyle(document.documentElement).getPropertyValue('--m2-accent'),
        };
    });
    console.log(theme, JSON.stringify(r));
    assert.ok(!r.h1.includes('⚓'), 'h1 has no anchor emoji');
    assert.ok(r.srWords.some(w => w.trim() === 'Anchored'), 'h1 keeps sr-only anchored word');
    assert.ok(r.h1.includes('Hollow Knight'));
    assert.equal(r.badge, 'Anchored');
    assert.ok(r.badgeNext, 'badge sits directly above the title');
    assert.equal(r.anchoredBtn, 0, 'no anchored-btn class');
    assert.deepEqual(r.glow, [], 'no 30px glow box-shadow in Rin');
    assert.match(r.play, /PLAY|Play/i);

    await page.screenshot({ path: `${SHOTS}/rin-anchored-${theme}-1280x800.png` });
    await page.locator('.rin-stage .mvp-btn.visit').focus();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/rin-anchored-focus-${theme}.png` });
    // Kamae badge reference for the style-parity assertion.
    await page.locator('[data-face="kamae"]').click();
    await page.locator('.kata-item-badge').first().waitFor({ state: 'attached' });
    const k = await page.evaluate(() => { const s = window.getComputedStyle(document.querySelector('.kata-item-badge')); return { color: s.color, size: s.fontSize, weight: s.fontWeight, ls: s.letterSpacing, tt: s.textTransform }; });
    assert.deepEqual(k, r.badgeStyle, 'Rin badge computed style equals Kamae badge');

    await page.locator('[data-face="maida2"]').click();
    const zone = page.locator('#m2-zone-now');
    await zone.waitFor();
    assert.equal((await zone.textContent()).trim(), 'Recently opened');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/maai-zone-label-${theme}.png` });
    await page.close();
}
await browser.close();
console.log('rin-anchored-check OK');
