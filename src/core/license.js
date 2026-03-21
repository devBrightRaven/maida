const KEY_PATTERN = /^MAIDA-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;

export function validateKeyFormat(key) {
    if (!key || typeof key !== 'string') return false;
    return KEY_PATTERN.test(key.trim().toUpperCase());
}

export function formatLicenseKey(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const clean = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (clean.length === 0) return '';
    // Auto-insert dashes: MAIDA-XXXXX-XXXXX-XXXXX
    const prefix = 'MAIDA';
    const rest = clean.startsWith(prefix) ? clean.slice(prefix.length) : clean;
    const parts = rest.match(/.{1,5}/g) || [];
    return `MAIDA-${parts.join('-')}`;
}

export function isKataUnlocked(licenseState) {
    return licenseState?.licensed === true;
}
