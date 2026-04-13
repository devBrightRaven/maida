// Consolidate Phase 1 + Phase 2 agent outputs into prescriptions.json + 3 translation files.
// Idempotent-ish: reads current state, applies changes, writes back.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/Code/maida';
const RAW = path.join(ROOT, 'docs/autoresearch-raw');
const EN_PATH = path.join(ROOT, 'src/data/prescriptions.json');
const TW_PATH = path.join(ROOT, 'src/i18n/prescriptions-zh-TW.json');
const CN_PATH = path.join(ROOT, 'src/i18n/prescriptions-zh-CN.json');
const JA_PATH = path.join(ROOT, 'src/i18n/prescriptions-ja.json');

const loadJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const saveJson = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 4) + '\n');

const en = loadJson(EN_PATH);
const tw = loadJson(TW_PATH);
const cn = loadJson(CN_PATH);
const ja = loadJson(JA_PATH);

// Build index: id -> location in EN nested structure
const indexEn = new Map();
for (const item of en.prescriptions.default) indexEn.set(item.id, { category: 'default', container: en.prescriptions.default, entry: item });
for (const item of en.prescriptions.idle_state) indexEn.set(item.id, { category: 'idle_state', container: en.prescriptions.idle_state, entry: item });
for (const [gameId, arr] of Object.entries(en.prescriptions.catalog)) {
    for (const item of arr) indexEn.set(item.id, { category: 'catalog', gameId, container: arr, entry: item });
}

// Load Phase 1 revisions
const phase1 = ['A','B','C','D'].flatMap(ag => loadJson(path.join(RAW, `phase1-${ag}.json`)));
console.log(`Phase 1 loaded: ${phase1.length} analysis entries`);

let revised = 0, skipped = 0, missing = 0;
for (const rev of phase1) {
    if (rev.analysis.severity === 'pass' || !rev.revisions) { skipped++; continue; }
    const loc = indexEn.get(rev.id);
    if (!loc) { console.warn(`Phase1 id not found in EN: ${rev.id}`); missing++; continue; }
    // Update EN entry in place
    if (rev.revisions.en) {
        loc.entry.kernel = rev.revisions.en.kernel;
        loc.entry.interface = rev.revisions.en.interface;
    }
    // Update 3 translations (flat)
    for (const [lang, bundle] of [['zh-TW', tw], ['zh-CN', cn], ['ja', ja]]) {
        if (rev.revisions[lang] && bundle[rev.id]) {
            bundle[rev.id].kernel = rev.revisions[lang].kernel;
            bundle[rev.id].interface = rev.revisions[lang].interface;
        }
    }
    revised++;
}
console.log(`Phase 1 applied: ${revised} revised, ${skipped} passed, ${missing} missing`);

// Load Phase 2 new prescriptions
const phase2E = loadJson(path.join(RAW, 'phase2-E.json')); // time-of-day
const phase2F = loadJson(path.join(RAW, 'phase2-F.json')); // emotional-states
const phase2G = loadJson(path.join(RAW, 'phase2-G.json')); // return-after-absence

// Prepare new category arrays (EN nested structure)
const buildEnEntry = (p) => {
    const { id, tier, kernel, interface: iface, momentum, audit, trigger } = p;
    return { id, tier, kernel, interface: iface, momentum, audit, trigger };
};

en.prescriptions['time-of-day'] = phase2E.map(buildEnEntry);
en.prescriptions['emotional-states'] = phase2F.map(buildEnEntry);
en.prescriptions['return-after-absence'] = phase2G.map(buildEnEntry);
en.prescriptions['socialstates'] = []; // reserved for v0.3.0

console.log(`New categories added: time-of-day(${phase2E.length}) emotional-states(${phase2F.length}) return-after-absence(${phase2G.length}) socialstates(0 reserved)`);

// Add translations (flat) for new prescriptions
let transAdded = 0;
for (const arr of [phase2E, phase2F, phase2G]) {
    for (const p of arr) {
        for (const [lang, bundle] of [['zh-TW', tw], ['zh-CN', cn], ['ja', ja]]) {
            if (p.translations && p.translations[lang]) {
                bundle[p.id] = {
                    kernel: p.translations[lang].kernel,
                    interface: p.translations[lang].interface,
                };
            }
        }
        transAdded++;
    }
}
console.log(`New translation entries added: ${transAdded} × 3 languages`);

// Save all 4 files
saveJson(EN_PATH, en);
saveJson(TW_PATH, tw);
saveJson(CN_PATH, cn);
saveJson(JA_PATH, ja);
console.log('Saved all 4 files.');

// Verify count
const newEn = loadJson(EN_PATH);
let total = newEn.prescriptions.default.length + newEn.prescriptions.idle_state.length;
for (const arr of Object.values(newEn.prescriptions.catalog)) total += arr.length;
for (const cat of ['time-of-day','emotional-states','return-after-absence','socialstates']) {
    total += newEn.prescriptions[cat].length;
}
console.log(`FINAL EN prescription count: ${total} (target: 88)`);

const newTw = loadJson(TW_PATH);
const twKeys = Object.keys(newTw).filter(k => k !== '_meta');
console.log(`FINAL zh-TW count: ${twKeys.length}`);

const newCn = loadJson(CN_PATH);
const cnKeys = Object.keys(newCn).filter(k => k !== '_meta');
console.log(`FINAL zh-CN count: ${cnKeys.length}`);

const newJa = loadJson(JA_PATH);
const jaKeys = Object.keys(newJa).filter(k => k !== '_meta');
console.log(`FINAL ja count: ${jaKeys.length}`);
