// Maai: card hero expansion off, dark stage in both themes, BUG-008 sub-line contrast.
// Browser-only fixture. Usage: dev server on 5201, then
// `E2E_BASE_URL=http://localhost:5201 node e2e/maai-stage-check.mjs`.
// Contrast is measured on rendered pixels (mode colour of the element's box
// = its real background incl. glass / backdrop) against the computed text colour.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5201';
const SHOTS = 'design/maida2-review/p5/screens';
await mkdir(SHOTS, { recursive: true });

// A bright, busy hero stand-in (worst case for a light-washed backdrop).
const HERO = `data:image/svg+xml;base64,${Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="620"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#e8c26a"/><stop offset="1" stop-color="#5b8fd6"/></linearGradient></defs><rect width="1920" height="620" fill="url(#g)"/></svg>'
).toString('base64')}`;

function patch({ hero }) {
    navigator.getGamepads = () => [null, null, null, null];
    const inner = window.__TAURI_INTERNALS__.invoke;
    let clip;
    const createClip = () => new Promise(resolve => {
        const canvas = document.createElement('canvas');
        canvas.width = 320; canvas.height = 180;
        const context = canvas.getContext('2d');
        const stream = canvas.captureStream(20);
        const recorder = new window.MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            resolve(window.URL.createObjectURL(new window.Blob(chunks, { type: 'video/webm' })));
        };
        let frame = 0;
        const timer = setInterval(() => {
            context.fillStyle = frame++ % 2 ? '#38536e' : '#658b5b';
            context.fillRect(0, 0, 320, 180);
        }, 50);
        recorder.start();
        setTimeout(() => { clearInterval(timer); recorder.stop(); }, 600);
    });
    window.__TAURI_INTERNALS__.invoke = async (cmd, args = {}) => {
        if (cmd === 'get_art') return args.kind === 'hero' ? hero : null;
        if (cmd === 'get_game_media') {
            if (!window.__wantVideo) return null;
            clip ??= createClip();
            return { movie: { mp4_480: await clip }, screenshots: [] };
        }
        return inner(cmd, args);
    };
}

const lum = ([r, g, b]) => {
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// Contrast of an element's text colour against the mode colour of its rendered box.
async function measure(page, selector, index = 0) {
    const loc = page.locator(selector).nth(index);
    const box = await loc.boundingBox();
    const textColor = await loc.evaluate(el => window.getComputedStyle(el).color);
    const clip = { x: Math.max(0, box.x - 2), y: Math.max(0, box.y - 2), width: box.width + 4, height: box.height + 4 };
    const b64 = (await page.screenshot({ clip })).toString('base64');
    return page.evaluate(async ({ b64, textColor }) => {
        const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
        const bmp = await window.createImageBitmap(blob);
        const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const counts = new Map();
        for (let i = 0; i < d.length; i += 4) {
            const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
            counts.set(k, (counts.get(k) || 0) + 1);
        }
        const [k] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        const bg = [((k >> 10) & 31) << 3 | 4, ((k >> 5) & 31) << 3 | 4, (k & 31) << 3 | 4];
        const m = textColor.match(/[\d.]+/g).map(Number);
        return { bg, text: m.slice(0, 3) };
    }, { b64, textColor });
}
async function contrast(page, selector, index = 0) {
    const { bg, text } = await measure(page, selector, index);
    return Math.round(ratio(text, bg) * 100) / 100;
}

const browser = await chromium.launch();
const stageAvg = {};
const results = [];
try {
    for (const theme of ['light', 'dark']) {
        // ── A. Hero stage (static hero image): height steady, no expansion, sub contrast ──
        for (const stage of [false, true]) {
            const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: theme });
            await page.addInitScript(installHistoryFixture, { locale: 'en' });
            await page.addInitScript(patch, { hero: stage ? HERO : null });
            await page.goto(BASE);
            await page.locator('[data-face="maida2"]').click();
            const cards = page.locator('.m2-card');
            await cards.first().waitFor();
            await page.mouse.move(1275, 400);
            await cards.first().focus();
            await page.waitForTimeout(150);
            const read = () => page.evaluate(() => {
                const cs = [...document.querySelectorAll('.m2-card')];
                return { h: cs[0].getBoundingClientRect().height, nextTop: cs[1] ? cs[1].getBoundingClientRect().top : null, expand: document.querySelectorAll('.m2-card-expand').length };
            });
            const before = await read();
            await page.waitForTimeout(1200); // > HERO_DWELL_MS 400 + hero fetch
            const after = await read();
            assert.equal(after.h, before.h, `${theme}/stage=${stage}: focused card height unchanged after dwell`);
            assert.equal(after.nextTop, before.nextTop, `${theme}/stage=${stage}: next card did not move`);
            assert.equal(after.expand, 0, 'no .m2-card-expand element');
            const stageOn = await page.evaluate(() => ({
                cls: document.querySelector('main.maida2-view').classList.contains('maida2-view--stage'),
                mainBg: window.getComputedStyle(document.querySelector('main.maida2-view')).backgroundColor,
                heroVisible: !!document.querySelector('.m2-hero-backdrop--visible'),
            }));
            assert.equal(stageOn.cls, stage, 'stage class only while the hero shows');
            if (stage) {
                assert.ok(stageOn.heroVisible, 'hero backdrop visible');
                assert.equal(stageOn.mainBg, 'rgb(10, 10, 10)', `${theme}: stage ground is dark`);
            }
            // sub-line contrast: focus-only, hover-only, hover+focus
            const sub = '.m2-card .m2-card-sub';
            const card0 = cards.first();
            const states = {};
            // focus-only (mouse parked away)
            await page.waitForTimeout(350);
            states.focus = await contrast(page, sub);
            if (stage) await page.screenshot({ path: `${SHOTS}/maai-focus-card-${theme}.png` });
            // hover+focus
            await card0.hover();
            await page.waitForTimeout(350);
            states.hoverFocus = await contrast(page, sub);
            // hover-only: drop focus, keep the mouse on the card (< 1s hover-dwell)
            await page.evaluate(() => document.activeElement?.blur());
            await page.waitForTimeout(350);
            states.hover = await contrast(page, sub);
            // title too, in the inverted state
            states.hoverTitle = await contrast(page, '.m2-card .m2-card-title');
            for (const [k, v] of Object.entries(states)) assert.ok(v >= 4.5, `${theme}/stage=${stage}/${k}: sub/title contrast ${v} >= 4.5`);
            results.push({ theme, stage, height: after.h, ...states });
            await page.close();
        }

        // ── B. Playing video stage ──
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: theme });
        await page.addInitScript(installHistoryFixture, { locale: 'en' });
        await page.addInitScript(patch, { hero: null });
        await page.addInitScript(() => { window.__wantVideo = true; });
        await page.goto(BASE);
        await page.locator('[data-face="maida2"]').click();
        await page.mouse.move(1275, 400);
        await page.locator('.m2-card').first().focus();
        const h0 = await page.locator('.m2-card').first().evaluate(el => el.getBoundingClientRect().height);
        await page.waitForFunction(() => {
            const v = document.querySelector('.m2-backdrop-media video');
            return v && !v.paused && v.readyState >= 2 && v.currentTime > 0;
        });
        await page.waitForTimeout(400);
        const h1 = await page.locator('.m2-card').first().evaluate(el => el.getBoundingClientRect().height);
        assert.equal(h1, h0, `${theme}: card height steady while video plays`);
        const info = await page.evaluate(() => {
            const main = document.querySelector('main.maida2-view');
            return { bg: window.getComputedStyle(main).backgroundColor, theme: main.getAttribute('data-theme'), cardTheme: document.querySelector('.m2-card').getAttribute('data-theme') };
        });
        assert.equal(info.bg, 'rgb(10, 10, 10)', `${theme}: dark stage ground under the video`);
        // Backdrop pixel in an empty strip left of the content column.
        const strip = await page.screenshot({ clip: { x: 1180, y: 60, width: 40, height: 40 } });
        const avg = await page.evaluate(async b64 => {
            const bmp = await window.createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
            const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
            const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height).data; const n = d.length / 4; const s = [0, 0, 0];
            for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
            return s.map(v => v / n);
        }, strip.toString('base64'));
        stageAvg[theme] = avg;
        // Shot before the contrast asserts so a failure leaves the evidence.
        await page.screenshot({ path: `${SHOTS}/maai-video-${theme}.png` });
        console.log(theme, JSON.stringify(await measure(page, 'main > .app-footer .app-footer-copyright')), JSON.stringify(await page.locator('main > .app-footer .app-footer-copyright').boundingBox()));
        const vid = {
            cardTitle: await contrast(page, '.m2-card .m2-card-title'),
            cardSub: await contrast(page, '.m2-card .m2-card-sub'),
            zoneTitle: await contrast(page, '.m2-zone-title', 0),
            footer: await contrast(page, 'main > .app-footer .app-footer-copyright'),
        };
        for (const [k, v] of Object.entries(vid)) assert.ok(v >= 4.5, `${theme}/video/${k}: contrast ${v} >= 4.5`);
        results.push({ theme, video: true, stagePixel: avg.map(Math.round), ...vid });
        await page.close();
    }
    // The video is not blended toward white in light theme: same pixels as dark.
    for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(stageAvg.light[i] - stageAvg.dark[i]) <= 6, `light/dark backdrop pixel channel ${i}: ${stageAvg.light[i]} vs ${stageAvg.dark[i]}`);
    }

    // ── C. Backdrop lifecycle: fade out when focus leaves all cards ──
    for (const reduced of [false, true]) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', reducedMotion: reduced ? 'reduce' : 'no-preference' });
        await page.addInitScript(installHistoryFixture, { locale: 'en' });
        await page.addInitScript(patch, { hero: HERO });
        await page.goto(BASE);
        await page.locator('[data-face="maida2"]').click();
        const cards = page.locator('.m2-card');
        await cards.first().waitFor();
        await page.mouse.move(1275, 400);
        const state = () => page.evaluate(() => {
            const bd = document.querySelector('.m2-hero-backdrop');
            const main = document.querySelector('main.maida2-view');
            return {
                opacity: Number(window.getComputedStyle(bd).opacity),
                image: window.getComputedStyle(bd).backgroundImage,
                stage: main.classList.contains('maida2-view--stage'),
                ground: window.getComputedStyle(main).backgroundColor,
            };
        });
        await cards.first().focus();
        await page.waitForFunction(() => document.querySelector('main.maida2-view')?.classList.contains('maida2-view--stage'));
        await page.waitForTimeout(350);
        const on = await state();
        assert.ok(on.stage && on.opacity > 0.3, `reduced=${reduced}: dwell turns stage + backdrop on`);
        // mouse to empty space: nothing changes
        await page.mouse.move(640, 790);
        await page.mouse.move(1275, 300);
        await page.waitForTimeout(350);
        const afterMouse = await state();
        assert.deepEqual(afterMouse, on, `reduced=${reduced}: mouse leaving a card changes nothing`);
        // card -> card: stage never drops
        if (await cards.count() > 1) {
            await cards.nth(1).focus();
            for (let i = 0; i < 6; i++) {
                assert.ok((await state()).stage, `reduced=${reduced}: stage holds across card-to-card move`);
                await page.waitForTimeout(40);
            }
        }
        // focus to sidebar: backdrop fades out, stage ends, ground returns to light
        await page.locator('.mode-navigation__tab[data-face="rin"]').focus();
        if (reduced) {
            const instant = await state();
            assert.equal(instant.opacity, 0, 'reduced motion: backdrop opacity 0 immediately');
        } else {
            await page.waitForTimeout(40);
            assert.ok((await state()).image.includes('url('), 'image still painted during fade');
        }
        await page.waitForTimeout(300);
        const off = await state();
        assert.equal(off.opacity, 0, `reduced=${reduced}: backdrop opacity 0 after 300ms`);
        assert.ok(off.image.includes('url('), 'hero image kept (not dropped) after fade');
        assert.equal(off.stage, false, `reduced=${reduced}: stage class gone`);
        const [r, g, b] = off.ground.match(/[\d.]+/g).map(Number);
        assert.ok(lum([r, g, b]) > 0.5, `reduced=${reduced}: light ground restored (${off.ground})`);
        results.push({ lifecycle: true, reduced });
        await page.close();
    }
} finally { await browser.close(); }
console.log(JSON.stringify(results, null, 1));
console.log('maai-stage-check OK');
