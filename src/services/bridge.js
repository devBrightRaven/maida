/**
 * Maida API Bridge
 * Safe wrapper around window.maidaAPI to allow for easier mocking and decoupling.
 */

const bridge = {
    getData: async (type) => {
        if (window.maidaAPI) {
            return await window.maidaAPI.getData(type);
        }
        console.warn(`[Bridge] maidaAPI.getData not found for ${type}`);
        return null;
    },

    saveData: async (type, data) => {
        if (window.maidaAPI) {
            return await window.maidaAPI.saveData(type, data);
        }
        console.warn(`[Bridge] maidaAPI.saveData not found for ${type}`);
        return { success: false };
    },

    requestOnboardingSync: async () => {
        if (window.maidaAPI) {
            return await window.maidaAPI.requestOnboardingSync();
        }
        return { error: 'API not available' };
    },

    performBackgroundSnapshot: async () => {
        if (window.maidaAPI && window.maidaAPI.performBackgroundSnapshot) {
            return await window.maidaAPI.performBackgroundSnapshot();
        }
        return { success: false };
    },

    minimizeWindow: () => {
        if (window.maidaAPI && window.maidaAPI.minimizeWindow) {
            window.maidaAPI.minimizeWindow();
        }
    },

    closeWindow: () => {
        if (window.maidaAPI && window.maidaAPI.closeWindow) {
            window.maidaAPI.closeWindow();
        }
    },

    checkSteamAvailable: async () => {
        if (window.maidaAPI && window.maidaAPI.checkSteamAvailable) {
            return await window.maidaAPI.checkSteamAvailable();
        }
        return { available: false };
    },

    resetGamesData: async () => {
        if (window.maidaAPI && window.maidaAPI.resetGamesData) {
            return await window.maidaAPI.resetGamesData();
        }
        return { success: false };
    },

    // Showcase & Warehouse
    getShowcase: async () => {
        if (window.maidaAPI?.getShowcase) {
            return await window.maidaAPI.getShowcase();
        }
        return { games: [], box: [], exploreHistory: { lastSessionDate: null, cardsShownToday: 0 } };
    },

    saveShowcase: async (data) => {
        if (window.maidaAPI?.saveShowcase) {
            return await window.maidaAPI.saveShowcase(data);
        }
        return { success: false };
    },

    searchWarehouse: async (query) => {
        if (window.maidaAPI?.searchWarehouse) {
            return await window.maidaAPI.searchWarehouse(query);
        }
        return [];
    },

    sampleWarehouse: async (excludeIds) => {
        if (window.maidaAPI?.sampleWarehouse) {
            return await window.maidaAPI.sampleWarehouse(excludeIds);
        }
        return null;
    },

    // Session log
    appendSessionLog: async (entry) => {
        if (window.maidaAPI?.appendSessionLog) {
            return await window.maidaAPI.appendSessionLog(entry);
        }
        return { success: false };
    },

    exportSessionLog: async () => {
        if (window.maidaAPI?.exportSessionLog) {
            return await window.maidaAPI.exportSessionLog();
        }
        return { success: false };
    },

    // Update checker
    checkForUpdates: async (options) => {
        if (window.maidaAPI?.checkForUpdates) {
            return await window.maidaAPI.checkForUpdates(options);
        }
        return null;
    },

    openReleasePage: (url) => {
        if (window.maidaAPI?.openReleasePage) {
            window.maidaAPI.openReleasePage(url);
        }
    },

    getAppVersion: async () => {
        if (window.maidaAPI?.getAppVersion) {
            return await window.maidaAPI.getAppVersion();
        }
        return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
    }
};

export default bridge;
