import en from './en.json';
import zhTW from './zh-TW.json';
import ja from './ja.json';

const translations = {
    en,
    'zh-TW': zhTW,
    ja
};

const SUPPORTED_LOCALES = Object.keys(translations);
const DEFAULT_LOCALE = 'en';

const LOCALE_STORAGE_KEY = 'maida_locale';

/**
 * Detect locale: manual override (localStorage) > browser/OS language > default.
 */
function detectLocale() {
    // 1. Manual override from Debug panel
    if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
        if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
    }

    // 2. Browser/OS language
    if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
    const lang = navigator.language || '';

    // Exact match first (e.g. 'zh-TW')
    if (SUPPORTED_LOCALES.includes(lang)) return lang;

    // Base language match (e.g. 'zh' -> 'zh-TW')
    const base = lang.split('-')[0];
    const match = SUPPORTED_LOCALES.find(l => l.split('-')[0] === base);
    if (match) return match;

    return DEFAULT_LOCALE;
}

let currentLocale = detectLocale();

// Sync HTML lang attribute with detected locale for screen readers
if (typeof document !== 'undefined') {
    document.documentElement.lang = currentLocale === 'zh-TW' ? 'zh-TW' : currentLocale;
}

/**
 * t(key, params)
 * Minimal translation helper.
 * Supports nested keys (e.g., 'ui.button.visit') and variable interpolation {name}.
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

    // Interpolation
    let template = result;
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
    return typeof result === 'string' ? result : null;
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
