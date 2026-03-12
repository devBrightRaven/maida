import bridge from './bridge';

// User data types: these are created by user actions, not shipped with the app
const USER_DATA_DEFAULTS = {
    anchor: null,           // No game anchored
    returnPenalties: [],    // No games skipped
    constraints: {          // Friction elimination filters
        installed_only: true,
        exclude_vr_only: false,
        exclude_appids: [],
        exclude_family_share: false
    }
};

export async function loadData(type) {
    try {
        const data = await bridge.getData(type);

        // IPC returned data (including null for "file exists but empty")
        if (data !== undefined) return data;
    } catch (e) {
        console.warn(`[Maida] IPC getData(${type}) failed:`, e);
    }

    // For user data types, return defaults immediately (don't try fetch)
    if (type in USER_DATA_DEFAULTS) {
        return USER_DATA_DEFAULTS[type];
    }

    // Fallback for web/dev or first run (only for app data like games/prescriptions)
    const storeKey = `maida_${type}`;
    const stored = localStorage.getItem(storeKey);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.warn(`[Maida] Corrupt localStorage for ${type}, clearing`);
            localStorage.removeItem(storeKey);
        }
    }

    // Final fallback: try to fetch from local assets in dev (only for app data)
    try {
        const resp = await fetch(`/src/data/${type}.json`);
        return await resp.json();
    } catch (e) {
        if (type === 'games') return { games: [] };
        return { prescriptions: { default: [], catalog: {} } };
    }
}

export async function saveData(type, data) {
    return await bridge.saveData(type, data);
}

export async function syncLibrary() {
    return await bridge.requestOnboardingSync();
}

// Showcase persistence
export async function loadShowcase() {
    return await bridge.getShowcase();
}

export async function saveShowcase(data) {
    return await bridge.saveShowcase(data);
}

// Warehouse search
export async function searchWarehouse(query) {
    return await bridge.searchWarehouse(query);
}

export async function sampleWarehouse(excludeIds) {
    return await bridge.sampleWarehouse(excludeIds);
}
