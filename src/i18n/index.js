import en from './en.json';

const translations = {
    en
};

let currentLocale = 'en';

/**
 * t(key, params)
 * Minimal translation helper.
 * Supports nested keys (e.g., 'ui.button.visit') and variable interpolation {name}.
 */
export function t(key, params = {}) {
    const keys = key.split('.');
    let result = translations[currentLocale];

    for (const k of keys) {
        if (result && result[k]) {
            result = result[k];
        } else {
            console.warn(`[i18n] Key not found: ${key}`);
            return key; // Fallback to key itself
        }
    }

    if (typeof result !== 'string') {
        console.warn(`[i18n] Key is not a string: ${key}`);
        return key;
    }

    // Interpolation
    let template = result;
    Object.keys(params).forEach(param => {
        template = template.replace(new RegExp(`{${param}}`, 'g'), params[param]);
    });

    return template;
}

export function setLocale(locale) {
    if (translations[locale]) {
        currentLocale = locale;
    } else {
        console.warn(`[i18n] Locale not found: ${locale}`);
    }
}

export function getLocale() {
    return currentLocale;
}
