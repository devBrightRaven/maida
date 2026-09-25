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

    saveHooks: (data) => invoke('save_data', { dataType: 'hooks', data }),

    resetGamesData: () => call('reset_games_data'),

    // --- Steam ---
    checkSteamAvailable: async () => {
        const result = await call('check_steam_available');
        return result ?? { available: false };
    },

    requestOnboardingSync: () => call('request_onboarding_sync'),

    performBackgroundSnapshot: () => call('perform_background_snapshot'),

    // Local Steam librarycache art only — zero network. kind is "capsule"
    // (portrait/landscape cover) or "hero" (wide banner). Missing art
    // (Ok(None)), an invalid kind (Err), or a failed invoke all degrade to
    // null via call().
    getArt: (appId, kind) => call('get_art', { appId, kind }),

    // Localized Steam titles, parsed locally from appinfo.vdf. Returns only
    // appIds that have a name in `lang`; a failed invoke degrades to null
    // (Maida2View then falls back to each game's own title, same as a
    // missing per-appid entry).
    getLocalizedTitles: (appIds, lang) => call('get_localized_titles', { appIds, lang }),

    // Official screenshot + microtrailer metadata (Maida 2.0 focus-expansion
    // preview). null covers both "no media available" (Ok(None)) and a
    // failed invoke — callers can't tell them apart, same as getArt.
    getGameMedia: (appId, lang) => call('get_game_media', { appId, lang }),

    // One screenshot image as a base64 data URL, downloaded + cached on
    // first request. index is 0-based against the list getGameMedia
    // returned; null covers "no such screenshot" and a failed invoke.
    getScreenshot: (appId, index) => call('get_screenshot', { appId, index }),

    // --- Showcase & Warehouse ---
    getShowcase: async () => {
        const result = await call('get_showcase');
        return result ?? { games: [], box: [], katas: [], activeKataId: null, exploreHistory: { lastSessionDate: null, cardsShownToday: 0 } };
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

    // --- Trace (Maida 2.0) ---
    // Direct invoke on purpose: trace writes must surface failures, not
    // swallow them into null (setFrozenGuardDuration precedent).
    appendTrace: (entry) => invoke('append_trace', { entry }),

    exportTrace: () => call('export_trace'),

    readTracePage: (options = {}) => invoke('read_trace_page', options),

    // --- Game launch ---
    launchGame: (steamUrl) => call('launch_game', { url: steamUrl }),

    // --- Window ---
    minimizeWindow: () => call('minimize_window'),

    closeWindow: () => call('close_window'),

    getAppVersion: async () => {
        const result = await call('get_app_version');
        return result ?? (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev');
    },

    // --- IGDB Credentials ---
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

    // --- Telemetry ---
    getTelemetryEnabled: async () => {
        const result = await call('get_telemetry_enabled');
        return result ?? true;
    },

    setTelemetryEnabled: (enabled) => call('set_telemetry_enabled', { enabled }),

    // --- License ---
    saveLicenseKey: (key) => call('save_license_key', { key }),

    loadLicenseKey: () => call('load_license_key'),

    checkLicense: async () => {
        const result = await call('check_license');
        return result ?? { licensed: false };
    },

    // --- Preferences ---
    getFrozenGuardDuration: async () => {
        const result = await call('get_frozen_guard_duration');
        return typeof result === 'number' ? result : 15;
    },

    setFrozenGuardDuration: async (seconds) => {
        const n = Math.round(Number(seconds));
        if (!Number.isFinite(n) || n < 5 || n > 30) {
            throw new Error(`frozen guard duration out of range: ${seconds} (expected 5..30)`);
        }
        const result = await call('set_frozen_guard_duration', { seconds: n });
        return result ?? { success: false, error: 'not implemented' };
    },

    // Maida 2.0 focus-expansion dwell-to-play delay. Only 3 or 5 seconds are
    // valid — a discrete either/or, not a range like the frozen guard above.
    getMaida2PlayDelaySeconds: async () => {
        const result = await call('get_maida2_play_delay_seconds');
        return result === 3 || result === 5 ? result : 5;
    },

    setMaida2PlayDelaySeconds: async (seconds) => {
        const n = Math.round(Number(seconds));
        if (n !== 3 && n !== 5) {
            throw new Error(`maida2 play delay out of range: ${seconds} (expected 3 or 5)`);
        }
        const result = await call('set_maida2_play_delay_seconds', { seconds: n });
        return result ?? { success: false, error: 'not implemented' };
    },

    // Maida 2.0 dwell-to-play preview audio (user ruling 2026-08-31: silence
    // clause repealed). Boolean, default on — unlike the discrete/range
    // preferences above, there's nothing to clamp.
    getMaida2PreviewAudio: async () => {
        const result = await call('get_maida2_preview_audio');
        return typeof result === 'boolean' ? result : true;
    },

    setMaida2PreviewAudio: (enabled) => call('set_maida2_preview_audio', { enabled: Boolean(enabled) }),

    // Maida 2.0 large motion effects (sidebar symbol bloom). Boolean when the
    // read succeeds; null when it doesn't (IPC rejection or a dropped
    // invoke, both already collapsed to null by call()). Callers must treat
    // null as "unknown" and never fall back to true here — bloom must stay
    // off until an actual boolean is confirmed (review 2026-09-26 R1: a
    // legacy config missing this field defaults to true, but that default is
    // the Rust getter's job on a successful read, not a mask over a
    // transport failure). One-way opt-out: callers must still AND the
    // resolved boolean with the OS prefers-reduced-motion check, which
    // always wins.
    getMaida2LargeMotion: async () => {
        const result = await call('get_maida2_large_motion');
        return typeof result === 'boolean' ? result : null;
    },

    // Always resolves to an object with `.success` — call() turns both an
    // IPC rejection and a dropped invoke into null, which would otherwise
    // read as neither success nor a reported error (review 2026-09-25 R2).
    setMaida2LargeMotion: async (enabled) => {
        const result = await call('set_maida2_large_motion', { enabled: Boolean(enabled) });
        return result ?? { success: false, error: 'not implemented' };
    },

    // Maida 2.0 card opacity (percent, 40..=100, default 70) — continuous
    // range like the frozen guard above, not a discrete either/or.
    getMaida2CardOpacity: async () => {
        const result = await call('get_maida2_card_opacity');
        return typeof result === 'number' ? result : 70;
    },

    setMaida2CardOpacity: async (percent) => {
        const n = Math.round(Number(percent));
        if (!Number.isFinite(n) || n < 40 || n > 100) {
            throw new Error(`maida2 card opacity out of range: ${percent} (expected 40..100)`);
        }
        const result = await call('set_maida2_card_opacity', { percent: n });
        return result ?? { success: false, error: 'not implemented' };
    },
};

export default bridge;
