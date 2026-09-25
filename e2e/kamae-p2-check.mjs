// P2 Kamae (+ Maai token touch-up): screenshots, overflow sweep, footer
// clearance, keyboard + mocked-gamepad traversal, layout decision record.
// Browser-only fixture (history-fixture.js). Capsule art comes from the local
// Steam librarycache when present, read-only, passed into the page as data
// URLs; games without a local capsule show the quiet no-art surface.
// Usage: dev server on 5197, then `node e2e/kamae-p2-check.mjs`.
import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5197';
const OUT = 'design/maida2-review/p2';
const SHOTS = `${OUT}/screens`;
await mkdir(SHOTS, { recursive: true });

// 34 installed games (>= 30 for the "many games" state). Titles match the
// appIds; art is only whatever the local cache has.
const CATALOG = [
    [367520, 'Hollow Knight'], [413150, 'Stardew Valley'], [1145360, 'Hades'], [504230, 'Celeste'],
    [646570, 'Slay the Spire'], [620, 'Portal 2'], [292030, 'The Witcher 3: Wild Hunt'], [1086940, "Baldur's Gate 3"],
    [1245620, 'ELDEN RING'], [105600, 'Terraria'], [588650, 'Dead Cells'], [814380, 'Sekiro: Shadows Die Twice'],
    [1794680, 'Vampire Survivors'], [632470, 'Disco Elysium'], [753640, 'Outer Wilds'], [391540, 'Undertale'],
    [268910, 'Cuphead'], [1868140, 'DAVE THE DIVER'], [548430, 'Deep Rock Galactic'], [1057090, 'Ori and the Will of the Wisps'],
    [1113560, 'NieR Replicant ver.1.22474487139...'], [524220, 'NieR:Automata'], [2379780, 'Balatro'], [1150690, 'OMORI'],
    [457140, 'Oxygen Not Included'], [294100, 'RimWorld'], [427520, 'Factorio'], [1062090, 'Timberborn'],
    [1102130, 'Florence'], [1030300, 'Hollow Knight: Silksong'], [1426210, 'It Takes Two'], [250900, 'The Binding of Isaac: Rebirth'],
    [261570, 'Ori and the Blind Forest: Definitive Edition'], [1091500, 'Cyberpunk 2077'],
];
const LONG_TITLE = 'The Legend of Heroes: Trails through Daybreak II — Director’s Extended Edition with Every Chapter';
const KATA_NAMES = {
    en: ['Before bed', 'Short sessions'],
    'zh-TW': ['睡前', '短時間'],
    'zh-CN': ['睡前', '短时间'],
    ja: ['寝る前', '短い時間'],
};

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
const artNote = `local capsule art for ${Object.keys(art).length}/${CATALOG.length} fixture games (others show the quiet no-art surface)`;

// Scenario -> showcase + games. Game ids are the fixture's own ids.
function scenario(name, locale) {
    const [k1, k2] = KATA_NAMES[locale] || KATA_NAMES.en;
    const games = CATALOG.map(([appId, title], i) => ({ id: `g${i + 1}`, steamAppId: appId, title, installed: true, score: 0, steamUrl: `steam://rungameid/${appId}`, steamLastPlayed: i < 3 ? Math.floor(Date.now() / 1000) - i * 86400 : 0 }));
    const ids = n => games.slice(0, n).map(g => g.id);
    switch (name) {
        case 'base': return { games, katas: [{ id: 'k1', name: k1, gameIds: ids(7) }, { id: 'k2', name: k2, gameIds: ['g9'] }], activeKataId: 'k1' };
        case 'full': return { games, katas: [{ id: 'k1', name: k1, gameIds: ids(15) }, { id: 'k2', name: k2, gameIds: ['g9'] }], activeKataId: 'k1' };
        case 'single': return { games, katas: [{ id: 'k1', name: k1, gameIds: ids(7) }], activeKataId: 'k1' };
        case 'none': return { games, katas: [], activeKataId: null };
        case 'empty': return { games, katas: [{ id: 'k1', name: k1, gameIds: [] }], activeKataId: null };
        case 'one': return { games, katas: [{ id: 'k1', name: k1, gameIds: ids(7) }, { id: 'k2', name: k2, gameIds: ['g9'] }], activeKataId: 'k2' };
        case 'long': {
            const long = games.map((g, i) => (i === 1 ? { ...g, title: LONG_TITLE } : g));
            return { games: long, katas: [{ id: 'k1', name: 'A kata with a thirty char name', gameIds: ids(5) }, { id: 'k2', name: '一個名字相當長的型用來測試換行效果吧', gameIds: ['g9'] }], activeKataId: 'k1' };
        }
        default: throw new Error(`unknown scenario ${name}`);
    }
}

// Runs in the page after installHistoryFixture.
function patchFixture({ art: artMap, data, mode, update }) {
    const f = window.__historyFixture;
    f.data.games.games = data.games;
    let showcase = { games: [], box: [], katas: data.katas, activeKataId: data.activeKataId, exploreHistory: { lastSessionDate: null, cardsShownToday: 0 } };
    const inner = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args = {}) => {
        if (cmd === 'get_art') {
            if (mode === 'noart') return null;
            return args.kind === 'capsule' ? (artMap[args.appId] ?? null) : null;
        }
        if (cmd === 'get_showcase') return showcase;
        if (cmd === 'save_showcase') { showcase = args.data; return null; }
        if (cmd === 'search_warehouse') return [];
        if (update && cmd === 'plugin:updater|check') return { rid: 1, available: true, version: '0.4.99', currentVersion: '0.4.3' };
        return inner(cmd, args);
    };
}

const browser = await chromium.launch();
const records = [];
async function openKamae({ width, height, locale = 'en', theme = 'light', scene = 'base', mode = 'art', scale = 1, update = false, pad = false }) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme, deviceScaleFactor: scale });
    page.on('pageerror', err => console.log('PAGEERROR', width, locale, theme, scene, err.message));
    await page.addInitScript(installHistoryFixture, { locale });
    await page.addInitScript(patchFixture, { art, data: scenario(scene, locale), mode, update });
    // Isolation: headless Chromium on a dev machine sees physical
    // controllers (a DualShock 4 was live during this work and its input
    // switched faces / launched games mid-run). Every page gets either no
    // pad or the mocked one, never real hardware.
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
    await page.locator('.kamae-columns').waitFor();
    // Require the same Kamae <main> to survive 800ms before measuring.
    await page.waitForFunction(async () => {
        const main = document.querySelector('main:has(> .mode-navigation) .kamae-columns')?.closest('main');
        if (!main) return false;
        await new Promise(r => setTimeout(r, 800));
        return main.isConnected && main.querySelector('.kamae-columns') !== null;
    }, null, { polling: 100, timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.querySelectorAll('.kamae-capsule')].every(el => el.dataset.artStatus !== 'loading'));
    if (update) await page.locator('.app-footer .version-link').waitFor();
    await page.waitForTimeout(150);
    return page;
}

async function metrics(page, label) {
    const m = await page.evaluate(() => {
        const root = document.querySelector('.app-root');
        const main = document.querySelector('main:has(> .mode-navigation)') || document.querySelector('main');
        const content = document.querySelector('.kamae-content');
        const cols = document.querySelector('.kamae-columns');
        const colBox = sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { left: Math.round(r.left), width: Math.round(r.width), top: Math.round(r.top) } : null; };
        return {
            innerWidth: window.innerWidth, innerHeight: window.innerHeight,
            docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            rootOverflow: root.scrollWidth > root.clientWidth,
            mainOverflow: main.scrollWidth > main.clientWidth,
            elementOverflow: [...document.querySelectorAll('body *')].filter(el => {
                const s = window.getComputedStyle(el);
                return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1;
            }).map(el => `${el.tagName}.${el.className}`),
            contentWidth: Math.round(content.getBoundingClientRect().width),
            layout: window.getComputedStyle(cols).display === 'grid' ? 'two-column' : 'stacked',
            katasCol: colBox('.kamae-col--katas'), gamesCol: colBox('.kamae-col--games'),
        };
    });
    // Long list: scroll to the end, the last row must clear the fixed footer.
    const clearance = await page.evaluate(async () => {
        const main = document.querySelector('main:has(> .mode-navigation)');
        // Jump (no smooth scroll), then wait until the position settles.
        main.style.scrollBehavior = 'auto';
        let prev = -1;
        for (let i = 0; i < 20 && main.scrollTop !== prev; i++) {
            prev = main.scrollTop;
            main.scrollTop = main.scrollHeight;
            await new Promise(r => setTimeout(r, 50));
        }
        const last = [...document.querySelectorAll('.showcase-item')].at(-1)?.getBoundingClientRect();
        const footer = document.querySelector('main > .app-footer')?.getBoundingClientRect();
        const out = last && footer ? { lastBottom: Math.round(last.bottom), footerTop: Math.round(footer.top) } : null;
        main.scrollTop = 0;
        main.style.scrollBehavior = '';
        return out;
    });
    const rec = { label, ...m, clearance };
    records.push(rec);
    assert(!m.docOverflow && !m.rootOverflow && !m.mainOverflow, `horizontal overflow: ${label}`);
    assert.deepEqual(m.elementOverflow, [], `element overflow: ${label}`);
    if (clearance) assert(clearance.lastBottom <= clearance.footerTop + 1, `last row covered by footer: ${label} ${JSON.stringify(clearance)}`);
    return rec;
}
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });

// Traversal: walk focus with ArrowDown (keyboard) or D-pad down (mocked
// gamepad) and record every stop. Every kata card, every game row, new kata
// and the footer version button must be reached; no stop may sit in a
// hidden column or outside the viewport horizontally.
async function traverse(page, via, steps) {
    await page.locator('.kata-item').focus();
    const seen = [];
    const press = async () => {
        if (via === 'keyboard') { await page.keyboard.press('ArrowDown'); return; }
        await page.evaluate(() => { window.__pad.buttons[13] = { pressed: true, value: 1 }; });
        await page.waitForTimeout(70);
        await page.evaluate(() => { window.__pad.buttons[13] = { pressed: false, value: 0 }; });
        await page.waitForTimeout(70);
    };
    for (let i = 0; i < steps; i++) {
        await press();
        const stop = await page.evaluate(() => {
            const el = document.activeElement;
            const r = el.getBoundingClientRect();
            const row = el.closest('.showcase-item');
            const kata = el.closest('.kata-group');
            return {
                key: el.matches('.kata-item') ? 'all' : kata ? `kata:${kata.getAttribute('aria-label')}` : row ? `row:${[...document.querySelectorAll('.showcase-item')].indexOf(row)}`
                    : el.matches('.kata-create-btn') ? 'new-kata' : el.matches('.app-footer .version-link') ? 'version' : el.className || el.tagName,
                visible: el.checkVisibility ? el.checkVisibility() : true,
                inX: r.width > 0 && r.left >= -1 && r.right <= window.innerWidth + 1,
            };
        });
        seen.push(stop);
    }
    return seen;
}
async function assertTraversal(page, via, label) {
    const expected = await page.evaluate(() => ({
        katas: [...document.querySelectorAll('.kata-group')].map(el => `kata:${el.getAttribute('aria-label')}`),
        rows: document.querySelectorAll('.showcase-item').length,
        // "new kata" only exists below MAX_KATAS (existing rule).
        newKata: !!document.querySelector('.kata-create-btn'),
    }));
    const steps = expected.rows + expected.katas.length * 4 + 40;
    const seen = await traverse(page, via, steps);
    const keys = new Set(seen.map(s => s.key));
    const missing = [
        ...(keys.has('all') ? [] : ['all']),
        ...(!expected.newKata || keys.has('new-kata') ? [] : ['new-kata']),
        ...(keys.has('version') ? [] : ['version']),
        ...expected.katas.filter(k => !keys.has(k)),
        ...Array.from({ length: expected.rows }, (_, i) => `row:${i}`).filter(k => !keys.has(k)),
    ];
    const bad = seen.filter(s => !s.visible || !s.inX);
    records.push({ label: `traversal ${label}`, via, steps, newKataPresent: expected.newKata, katas: expected.katas.length, rows: expected.rows, missing, bad: bad.length });
    assert.deepEqual(missing, [], `${label}: not reached`);
    assert.deepEqual(bad, [], `${label}: focus in hidden/off-screen place`);
}

try {
    // 1. Overflow + footer sweep: every width x 4 locales x 2 themes.
    for (const locale of ['en', 'zh-TW', 'zh-CN', 'ja']) {
        for (const theme of ['light', 'dark']) {
            for (const width of [320, 768, 1024, 1280, 1440, 1742, 1920]) {
                const page = await openKamae({ width, height: 800, locale, theme, scene: 'none' });
                await metrics(page, `sweep ${locale} ${theme} ${width} (All installed, 34 games)`);
                await page.close();
            }
        }
    }
    // Same sweep in kata mode (Remove buttons, counter, search) for en + ja.
    for (const locale of ['en', 'ja']) {
        for (const width of [320, 768, 1024, 1280, 1440, 1742, 1920]) {
            const page = await openKamae({ width, height: 800, locale, theme: 'dark', scene: 'full' });
            await metrics(page, `sweep-kata ${locale} dark ${width}`);
            await page.close();
        }
    }

    // 2. Canvases: 1280x800, 1280x720, 1920x1080 x en/zh-TW/ja x light/dark.
    for (const [w, h] of [[1280, 800], [1280, 720], [1920, 1080]]) {
        for (const locale of ['en', 'zh-TW', 'ja']) {
            for (const theme of ['light', 'dark']) {
                const page = await openKamae({ width: w, height: h, locale, theme });
                const m = await metrics(page, `canvas ${w}x${h} ${locale} ${theme}`);
                if (w === 1280) assert.equal(m.layout, 'two-column', `layout at ${w}x${h}`);
                await shot(page, `kamae-${w}x${h}-${locale}-${theme}`);
                await page.close();
            }
        }
    }

    // 3. States.
    const states = [
        ['none', 'art', 'state-no-katas'],
        ['empty', 'art', 'state-empty-kata'],
        ['one', 'art', 'state-kata-one-game'],
        ['full', 'art', 'state-kata-full'],
        ['base', 'noart', 'state-missing-art'],
        ['long', 'art', 'state-long-names'],
    ];
    for (const [scene, mode, name] of states) {
        for (const theme of ['light', 'dark']) {
            const page = await openKamae({ width: 1280, height: 800, theme, scene, mode });
            await metrics(page, `${name} ${theme}`);
            await shot(page, `${name}-${theme}`);
            if (scene === 'none') {
                const main = page.locator('main:has(> .mode-navigation)');
                await main.evaluate(el => { el.scrollTop = el.scrollHeight; });
                await page.waitForTimeout(100);
                await shot(page, `state-many-games-scrolled-${theme}`);
            }
            await page.close();
        }
    }
    {
        const page = await openKamae({ width: 1280, height: 800, locale: 'zh-CN', theme: 'light' });
        await metrics(page, 'canvas 1280x800 zh-CN light');
        await shot(page, 'kamae-1280x800-zh-CN-light');
        await page.close();
    }
    // Membership editor open + focus vs active on the same card.
    for (const theme of ['light', 'dark']) {
        const page = await openKamae({ width: 1280, height: 800, theme });
        await page.locator('.kata-group--active .kata-select-btn').focus();
        await shot(page, `state-active-and-focused-${theme}`);
        await page.locator('.kata-group:not(.kata-group--active)').focus();
        await shot(page, `state-focus-inactive-kata-${theme}`);
        await page.locator('.kata-group--active .kata-expand-btn').click();
        await page.waitForTimeout(100);
        await metrics(page, `membership-open ${theme}`);
        await shot(page, `state-membership-open-${theme}`);
        await page.close();
    }
    // Focus-ring geometry (P2 fix): kata-select-btn's ring (outline width +
    // offset, outset from its box) must never intersect the ACTIVE badge or
    // the +/x buttons — en + ja, light + dark, 1280x800.
    const rectsIntersect = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    for (const locale of ['en', 'ja']) {
        for (const theme of ['light', 'dark']) {
            const page = await openKamae({ width: 1280, height: 800, locale, theme });
            await page.locator('.kata-group--active .kata-select-btn').focus();
            const geo = await page.evaluate(() => {
                const btn = document.querySelector('.kata-group--active .kata-select-btn');
                const badge = document.querySelector('.kata-group--active .kata-item-badge');
                const expand = document.querySelector('.kata-group--active .kata-expand-btn');
                const del = document.querySelector('.kata-group--active .kata-delete-btn');
                const cs = window.getComputedStyle(btn);
                const ext = parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset);
                const r = btn.getBoundingClientRect();
                const ring = { left: r.left - ext, right: r.right + ext, top: r.top - ext, bottom: r.bottom + ext };
                const rectOf = el => el.getBoundingClientRect().toJSON();
                return { ring, badge: rectOf(badge), expand: rectOf(expand), del: rectOf(del) };
            });
            const hitsBadge = rectsIntersect(geo.ring, geo.badge);
            const hitsExpand = rectsIntersect(geo.ring, geo.expand);
            const hitsDel = rectsIntersect(geo.ring, geo.del);
            records.push({ label: `focus-ring-clear ${locale} ${theme}`, ...geo, hitsBadge, hitsExpand, hitsDel });
            assert(!hitsBadge, `focus ring intersects ACTIVE badge: ${locale} ${theme} ${JSON.stringify(geo)}`);
            assert(!hitsExpand, `focus ring intersects +/expand button: ${locale} ${theme} ${JSON.stringify(geo)}`);
            assert(!hitsDel, `focus ring intersects x/delete button: ${locale} ${theme} ${JSON.stringify(geo)}`);
            if (locale === 'en') {
                await page.locator('.kata-group--active').screenshot({ path: `${SHOTS}/kamae-focus-${theme}.png` });
            }
            await page.close();
        }
    }

    // 200% zoom of a 1280x800 window = 640x400 CSS px at DPR 2.
    for (const theme of ['light', 'dark']) {
        const page = await openKamae({ width: 640, height: 400, theme, scale: 2 });
        const m = await metrics(page, `zoom200 ${theme}`);
        assert.equal(m.layout, 'stacked', 'zoom 200% stacks');
        await shot(page, `state-zoom200-${theme}`);
        await page.locator('main:has(> .mode-navigation)').evaluate(el => { el.scrollTop += document.querySelector('.kamae-columns').getBoundingClientRect().top - el.getBoundingClientRect().top; });
        await page.waitForTimeout(100);
        await shot(page, `state-zoom200-${theme}-scrolled`);
        await page.close();
    }

    // 4. Traversal: keyboard + mocked gamepad, two-column and stacked,
    // kata mode (Remove buttons) and All installed (34 rows).
    // 'base' has MAX_KATAS (2) katas, so no "new kata" button; 'single' and
    // 'none' cover it.
    for (const [width, scene] of [[1280, 'base'], [1280, 'single'], [1280, 'none'], [768, 'single'], [320, 'base']]) {
        for (const via of ['keyboard', 'gamepad']) {
            const page = await openKamae({ width, height: 800, scene, update: true, pad: via === 'gamepad' });
            await page.bringToFront();
            await assertTraversal(page, via, `${via} ${width} ${scene}`);
            await page.close();
        }
    }

    // 5. Settings panel (same controls/order, restyled) light/dark.
    for (const theme of ['light', 'dark']) {
        const page = await openKamae({ width: 1280, height: 800, theme });
        await page.keyboard.press('F10');
        await page.locator('.kamae-settings').waitFor();
        await page.waitForTimeout(150);
        await shot(page, `settings-${theme}`);
        await page.locator('.kamae-settings-disclosure[aria-controls="a11y-options"]').click();
        await page.locator('[data-large-motion="true"]').focus();
        await page.locator('#a11y-large-motion-heading').evaluate(el => el.closest('.kamae-settings-a11y-item').scrollIntoView({ block: 'center' }));
        await shot(page, `settings-a11y-${theme}`);
        await page.close();
    }

    // 6. Maai after the token touch-up, light/dark, with and without art.
    for (const theme of ['light', 'dark']) {
        for (const mode of ['art', 'noart']) {
            const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: theme });
            await page.addInitScript(installHistoryFixture, { locale: 'en' });
            await page.addInitScript(patchFixture, { art, data: scenario('base', 'en'), mode, update: false });
            await page.addInitScript(() => { Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] }); });
            await page.goto(BASE);
            await page.locator('.maida2-view').waitFor();
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(400);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
            assert(!overflow, `Maai overflow ${theme} ${mode}`);
            await shot(page, `maai-${theme}-${mode}`);
            await page.close();
        }
    }

    const layouts = records.filter(r => r.layout).map(r => ({ label: r.label, width: r.innerWidth, height: r.innerHeight, contentWidth: r.contentWidth, layout: r.layout }));
    await writeFile(`${OUT}/metrics.json`, JSON.stringify({ artNote, layouts, records }, null, 2));
    const decision = [...new Map(layouts.filter(l => l.label.startsWith('canvas') || l.label.startsWith('sweep ')).map(l => [`${l.width}x${l.height}`, `${l.width}x${l.height}: ${l.layout} (content ${l.contentWidth}px)`])).values()];
    console.log(`kamae-p2: ${records.length} checks passed; ${artNote}`);
    console.log(decision.join('\n'));
} finally {
    await browser.close();
}
