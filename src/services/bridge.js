/**
 * Maida API Bridge — Tauri edition
 *
 * Single abstraction layer between React frontend and Tauri Rust backend.
 * All IPC goes through @tauri-apps/api invoke().
 * Fallbacks ensure the app degrades gracefully if a command isn't registered yet.
 */
import { invoke } from '@tauri-apps/api/core';

async function call(cmd, args = {}) {
    try {
        return await invoke(cmd, args);
    } catch (err) {
        console.warn(`[Bridge] ${cmd} failed:`, err);
        return null;
    }
}

const bridge = {
    // --- Data persistence ---
    getData: (type) => call('get_data', { dataType: type }),

    saveData: (type, data) => call('save_data', { dataType: type, data }),

    resetGamesData: () => call('reset_games_data'),

    // --- Steam ---
    checkSteamAvailable: async () => {
        const result = await call('check_steam_available');
        return result ?? { available: false };
    },

    requestOnboardingSync: () => call('request_onboarding_sync'),

    performBackgroundSnapshot: () => call('perform_background_snapshot'),

    // --- Showcase & Warehouse ---
    getShowcase: async () => {
        const result = await call('get_showcase');
        return result ?? { games: [], box: [], channels: [], activeChannelId: null, exploreHistory: { lastSessionDate: null, cardsShownToday: 0 } };
    },

    saveShowcase: (data) => call('save_showcase', { data }),

    searchWarehouse: async (query) => {
        const result = await call('search_warehouse', { query });
        return result ?? [];
    },

    sampleWarehouse: (excludeIds) => call('sample_warehouse', { excludeIds }),

    resetExploreLimit: () => call('reset_explore_limit'),

    // --- Session log ---
    appendSessionLog: (entry) => call('append_session_log', { entry }),

    exportSessionLog: () => call('export_session_log'),

    // --- Window ---
    minimizeWindow: () => call('minimize_window'),

    closeWindow: () => call('close_window'),

    getAppVersion: async () => {
        const result = await call('get_app_version');
        return result ?? (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev');
    },

    // --- Update checker (Phase 2) ---
    checkForUpdates: async (options) => {
        const result = await call('check_for_updates', { options });
        return result;
    },

    openReleasePage: (url) => call('open_release_page', { url }),

    // --- IGDB Credentials (Phase 2) ---
    saveIgdbCredentials: async (clientId, clientSecret) => {
        const result = await call('save_igdb_credentials', { clientId, clientSecret });
        return result ?? { success: false, error: 'not implemented' };
    },

    loadIgdbCredentials: () => call('load_igdb_credentials'),

    testIgdbCredentials: async (clientId, clientSecret) => {
        const result = await call('test_igdb_credentials', { clientId, clientSecret });
        return result ?? { success: false, error: 'not implemented' };
    },

    clearIgdbCredentials: async () => {
        const result = await call('clear_igdb_credentials');
        return result ?? { success: false, error: 'not implemented' };
    },

    // --- License (Phase 4) ---
    saveLicenseKey: (key) => call('save_license_key', { key }),

    loadLicenseKey: () => call('load_license_key'),

    checkLicense: async () => {
        const result = await call('check_license');
        return result ?? { licensed: false };
    },
};

export default bridge;
