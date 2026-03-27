/**
 * Prescription i18n resolver.
 * Looks up translated kernel/interface by prescription ID.
 * Falls back to original English text if no translation found.
 */

import { getLocale } from './index';

const translationModules = {
    'zh-TW': () => import('./prescriptions-zh-TW.json'),
    'zh-CN': () => import('./prescriptions-zh-CN.json'),
    ja: () => import('./prescriptions-ja.json')
};

let cache = {};

/**
 * Load prescription translations for the current locale.
 * Call once after locale is set (e.g., on app init).
 */
export async function loadPrescriptionTranslations() {
    const locale = getLocale();
    if (locale === 'en' || cache[locale]) return;

    const loader = translationModules[locale];
    if (!loader) return;

    try {
        const mod = await loader();
        cache[locale] = mod.default || mod;
    } catch (e) {
        console.warn(`[i18n] Failed to load prescription translations for ${locale}:`, e);
    }
}

/**
 * Get localized prescription text.
 * Returns { kernel, interface } with translated text if available.
 */
export function localizePrescription(prescription) {
    if (!prescription) return prescription;

    const locale = getLocale();
    if (locale === 'en') return prescription;

    const translations = cache[locale];
    if (!translations || !translations[prescription.id]) return prescription;

    const t = translations[prescription.id];
    return {
        ...prescription,
        kernel: t.kernel || prescription.kernel,
        interface: t.interface || prescription.interface
    };
}
