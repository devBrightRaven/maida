import en from './en.json';
import zhTW from './zh-TW.json';
import zhCN from './zh-CN.json';
import ja from './ja.json';

const translations = {
    en,
    'zh-TW': zhTW,
    'zh-CN': zhCN,
    ja
};

const SUPPORTED_LOCALES = Object.keys(translations);
const DEFAULT_LOCALE = 'en';

const LOCALE_STORAGE_KEY = 'maida_locale';

// BUG-009: script/region-aware Chinese mapping. Simplified script or a
// Simplified-majority region resolves to zh-CN; Traditional script or a
// Traditional-majority region resolves to zh-TW. Script subtag wins over
// region when both are present (e.g. zh-Hans-TW -> zh-CN, script overrides
// the unusual region pairing).
const ZH_SIMPLIFIED_REGIONS = new Set(['cn', 'sg', 'my']);
const ZH_TRADITIONAL_REGIONS = new Set(['tw', 'hk', 'mo']);

/**
 * Resolve a `zh*` BCP-47 tag to zh-CN / zh-TW using script and region
 * subtags. Returns null for non-Chinese tags.
 *
 * Bare `zh` (no script, no region) has no Simplified/Traditional signal in
 * the tag itself, so it keeps the pre-BUG-009 default of zh-TW rather than
 * guessing — no evidence was found that WebView2 or WebKitGTK ever emit a
 * bare `zh` for a Simplified-script OS; both observed real-world cases
 * (BUG-009 report) were fuller tags (zh-Hans-CN style).
 */
function resolveChineseTag(lang) {
    const lower = lang.toLowerCase();
    if (lower !== 'zh' && !lower.startsWith('zh-')) return null;

    const parts = lower.split('-');
    if (parts.length === 1) return 'zh-TW';

    if (parts.includes('hans')) return 'zh-CN';
    if (parts.includes('hant')) return 'zh-TW';

    const region = parts[1];
    if (ZH_SIMPLIFIED_REGIONS.has(region)) return 'zh-CN';
    if (ZH_TRADITIONAL_REGIONS.has(region)) return 'zh-TW';

    return null;
}

/**
 * Resolve a single BCP-47 tag against SUPPORTED_LOCALES: exact match, then
 * script/region-aware Chinese mapping, then bare base-language match.
 * Returns null when nothing matches.
 */
function resolveTag(lang) {
    if (!lang) return null;

    // Exact match first (e.g. 'zh-TW')
    if (SUPPORTED_LOCALES.includes(lang)) return lang;

    const zhMatch = resolveChineseTag(lang);
    if (zhMatch) return zhMatch;

    // Base language match (e.g. 'ja-JP' -> 'ja')
    const base = lang.split('-')[0];
    const match = SUPPORTED_LOCALES.find(l => l.split('-')[0] === base);
    if (match) return match;

    return null;
}

/**
 * Detect locale: manual override (localStorage) > browser/OS language(s) > default.
 */
export function detectLocale() {
    // 1. Manual override from Debug panel
    if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
        if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
    }

    // 2. Browser/OS language(s). Prefer navigator.languages (full ordered
    // preference list) when present; fall back to the single navigator.language.
    if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
    const candidates = Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language || ''];

    for (const lang of candidates) {
        const resolved = resolveTag(lang);
        if (resolved) return resolved;
    }

    return DEFAULT_LOCALE;
}

let currentLocale = detectLocale();

// Sync HTML lang attribute with detected locale for screen readers.
// Keep full BCP-47 locale (zh-TW / zh-CN) so NVDA distinguishes traditional
// vs simplified Chinese pronunciation. 'zh' alone triggers simplified mode.
if (typeof document !== 'undefined') {
    document.documentElement.lang = currentLocale;
}

/**
 * t(key, params)
 * Minimal translation helper.
 * Supports nested keys (e.g., 'ui.button.visit') and variable interpolation {name}.
 * A leaf may also be a plural object `{ one, other }`; pass `count` in params
 * to pick between them (count === 1 -> one, otherwise -> other). Locales with
 * no plural distinction (ja/zh) just repeat the same string in both slots —
 * this keeps every locale file key-identical (enforced by
 * __tests__/i18n/translations.test.js's flattened-key comparison).
 * Falls back to English if key not found in current locale.
 */
export function t(key, params = {}) {
    const keys = key.split('.');

    // Try current locale first, then fall back to English
    let result = resolve(keys, translations[currentLocale]);
    if (result === null && currentLocale !== DEFAULT_LOCALE) {
        result = resolve(keys, translations[DEFAULT_LOCALE]);
    }
    if (result === null) {
        console.warn(`[i18n] Key not found: ${key}`);
        return key;
    }

    // Plural object -> pick the branch, then interpolate as usual.
    let template = typeof result === 'string'
        ? result
        : (params.count === 1 ? result.one : result.other);

    // Interpolation
    Object.keys(params).forEach(param => {
        template = template.replace(new RegExp(`{${param}}`, 'g'), params[param]);
    });

    return template;
}

function resolve(keys, obj) {
    let result = obj;
    for (const k of keys) {
        if (result && result[k] !== undefined) {
            result = result[k];
        } else {
            return null;
        }
    }
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object' && !Array.isArray(result)
        && typeof result.one === 'string' && typeof result.other === 'string') {
        return result;
    }
    return null;
}

export function setLocale(locale) {
    if (translations[locale]) {
        currentLocale = locale;
        try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch {}
        if (typeof document !== 'undefined') {
            document.documentElement.lang = locale;
        }
    } else {
        console.warn(`[i18n] Locale not found: ${locale}`);
    }
}

export function getLocale() {
    return currentLocale;
}

export function getSupportedLocales() {
    return SUPPORTED_LOCALES;
}
