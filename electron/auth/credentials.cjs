const fs = require('fs');
const path = require('path');

/**
 * Credentials storage for IGDB (Twitch Developer) credentials.
 * Uses Electron safeStorage for encryption when available,
 * falls back to plain text JSON otherwise.
 */

/**
 * Get the credentials file path.
 * @returns {string}
 */
function getCredentialsPath() {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'igdb-credentials.enc');
}

/**
 * Check if safeStorage is available and ready.
 * @returns {boolean}
 */
function isSafeStorageAvailable() {
    try {
        const { safeStorage } = require('electron');
        return safeStorage.isEncryptionAvailable();
    } catch {
        return false;
    }
}

/**
 * Save IGDB credentials (clientId + clientSecret).
 * Encrypts with safeStorage if available, otherwise plain JSON.
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {{ success: boolean, encrypted: boolean, error?: string }}
 */
function saveCredentials(clientId, clientSecret) {
    if (!clientId || !clientSecret) {
        return { success: false, encrypted: false, error: 'Missing clientId or clientSecret' };
    }

    const filePath = getCredentialsPath();
    const payload = JSON.stringify({ clientId, clientSecret });

    try {
        if (isSafeStorageAvailable()) {
            const { safeStorage } = require('electron');
            const encrypted = safeStorage.encryptString(payload);
            fs.writeFileSync(filePath, encrypted);
            console.log('[Credentials] Saved encrypted credentials');
            return { success: true, encrypted: true };
        }

        // Fallback: plain text JSON
        console.warn('[Credentials] safeStorage unavailable — saving as plain text');
        fs.writeFileSync(filePath, payload, 'utf8');
        return { success: true, encrypted: false };
    } catch (e) {
        console.error('[Credentials] Save failed:', e.message);
        return { success: false, encrypted: false, error: e.message };
    }
}

/**
 * Load stored IGDB credentials.
 * @returns {{ clientId: string, clientSecret: string } | null}
 */
function loadCredentials() {
    const filePath = getCredentialsPath();

    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        const raw = fs.readFileSync(filePath);

        if (isSafeStorageAvailable()) {
            try {
                const { safeStorage } = require('electron');
                const decrypted = safeStorage.decryptString(raw);
                const data = JSON.parse(decrypted);
                if (data.clientId && data.clientSecret) return data;
                return null;
            } catch {
                // May be plain text from a previous fallback save
            }
        }

        // Try plain text JSON
        const text = raw.toString('utf8');
        const data = JSON.parse(text);
        if (data.clientId && data.clientSecret) return data;
        return null;
    } catch (e) {
        console.warn('[Credentials] Load failed:', e.message);
        return null;
    }
}

/**
 * Delete stored credentials.
 * @returns {{ success: boolean }}
 */
function clearCredentials() {
    const filePath = getCredentialsPath();

    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('[Credentials] Cleared credentials file');
        }
        return { success: true };
    } catch (e) {
        console.error('[Credentials] Clear failed:', e.message);
        return { success: false, error: e.message };
    }
}

module.exports = { saveCredentials, loadCredentials, clearCredentials };
