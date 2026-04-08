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

        // IPC returned valid data — null means file not found, fall through to next
        if (data != null) return data;
    } catch (e) {
        console.warn(`[Maida] IPC getData(${type}) failed:`, e);
    }

    // For user data types, return defaults immediately (don't try fetch)
    if (type in USER_DATA_DEFAULTS) {
        return USER_DATA_DEFAULTS[type];
    }

    // In Tauri, null from backend means no data — return empty defaults
    if (type === 'games') return { games: [], source: 'uninitialized' };
    if (type === 'prescriptions') return { prescriptions: { default: [], catalog: {} } };
    return null;
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
