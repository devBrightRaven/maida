/**
 * i18n completeness validation.
 * Ensures every translation file covers all keys from the English source.
 *
 * To add a new locale:
 *   1. Create src/i18n/<locale>.json (UI strings)
 *   2. Create src/i18n/prescriptions-<locale>.json (prescription translations)
 *   3. This test will automatically pick it up and verify completeness.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const I18N_DIR = join(__dirname, '../../i18n');
const DATA_DIR = join(__dirname, '../../data');

// --- Helpers ---

/** Flatten nested object keys into dot-notation paths */
function flattenKeys(obj, prefix = '') {
    const keys = [];
    for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            keys.push(...flattenKeys(v, path));
        } else {
            keys.push(path);
        }
    }
    return keys.sort();
}

/** Recursively collect all prescription IDs from prescriptions.json */
function collectPrescriptionIds(obj) {
    const ids = [];
    if (Array.isArray(obj)) {
        obj.forEach(item => { if (item.id) ids.push(item.id); });
    } else if (obj && typeof obj === 'object') {
        if (obj.id) ids.push(obj.id);
        Object.values(obj).forEach(v => ids.push(...collectPrescriptionIds(v)));
    }
    return [...new Set(ids)].sort();
}

/** Discover locale files matching a pattern in i18n dir */
function discoverLocaleFiles(pattern) {
    return readdirSync(I18N_DIR)
        .filter(f => pattern.test(f))
        .map(f => ({
            file: f,
            locale: f.replace(pattern, '$1'),
            path: join(I18N_DIR, f)
        }));
}

// --- Load source data ---

const enJson = JSON.parse(readFileSync(join(I18N_DIR, 'en.json'), 'utf-8'));
const enKeys = flattenKeys(enJson);

const prescriptionsJson = JSON.parse(readFileSync(join(DATA_DIR, 'prescriptions.json'), 'utf-8'));
const prescriptionIds = collectPrescriptionIds(prescriptionsJson.prescriptions);

// Discover locale files (exclude en.json)
const uiLocales = discoverLocaleFiles(/^([a-z]{2}(?:-[A-Z]{2})?)\.json$/)
    .filter(l => l.locale !== 'en');

const rxLocales = discoverLocaleFiles(/^prescriptions-([a-z]{2}(?:-[A-Z]{2})?)\.json$/);

// --- Tests ---

describe('i18n: UI string completeness', () => {
    if (uiLocales.length === 0) {
        it.skip('no non-English locale files found', () => {});
        return;
    }

    for (const { locale, path } of uiLocales) {
        describe(`${locale}`, () => {
            const localeJson = JSON.parse(readFileSync(path, 'utf-8'));
            const localeKeys = flattenKeys(localeJson);

            it('has all keys from en.json', () => {
                const missing = enKeys.filter(k => !localeKeys.includes(k));
                expect(missing, `Missing keys in ${locale}.json`).toEqual([]);
            });

            it('has no extra keys not in en.json', () => {
                const extra = localeKeys.filter(k => !enKeys.includes(k));
                expect(extra, `Extra keys in ${locale}.json`).toEqual([]);
            });

            it('has no empty string values', () => {
                const empty = localeKeys.filter(k => {
                    const val = k.split('.').reduce((o, p) => o?.[p], localeJson);
                    return val === '';
                });
                expect(empty, `Empty values in ${locale}.json`).toEqual([]);
            });
        });
    }
});

describe('i18n: prescription translation completeness', () => {
    if (rxLocales.length === 0) {
        it.skip('no prescription translation files found', () => {});
        return;
    }

    for (const { locale, path } of rxLocales) {
        describe(`${locale}`, () => {
            const translations = JSON.parse(readFileSync(path, 'utf-8'));
            const translationIds = Object.keys(translations).filter(k => k !== '_meta').sort();

            it('has all prescription IDs', () => {
                const missing = prescriptionIds.filter(id => !translationIds.includes(id));
                expect(missing, `Missing prescription IDs in prescriptions-${locale}.json`).toEqual([]);
            });

            it('has no extra prescription IDs', () => {
                const extra = translationIds.filter(id => !prescriptionIds.includes(id));
                expect(extra, `Extra IDs in prescriptions-${locale}.json`).toEqual([]);
            });

            it('every entry has kernel and interface fields', () => {
                const incomplete = translationIds.filter(id => {
                    const entry = translations[id];
                    return !entry.kernel || !entry.interface;
                });
                expect(incomplete, `Entries missing kernel/interface in prescriptions-${locale}.json`).toEqual([]);
            });

            it('no empty kernel or interface values', () => {
                const empty = translationIds.filter(id => {
                    const entry = translations[id];
                    return entry.kernel === '' || entry.interface === '';
                });
                expect(empty, `Empty kernel/interface in prescriptions-${locale}.json`).toEqual([]);
            });
        });
    }
});

describe('i18n: JSON validity', () => {
    const allJsonFiles = readdirSync(I18N_DIR).filter(f => f.endsWith('.json'));

    for (const file of allJsonFiles) {
        it(`${file} is valid JSON`, () => {
            const content = readFileSync(join(I18N_DIR, file), 'utf-8');
            expect(() => JSON.parse(content)).not.toThrow();
        });
    }
});
