export const BOX_COOLDOWN_DAYS = 14;

export function createEmptyBox() {
    return { entries: [] };
}

export function addToBox(state, gameId, dismissedAt) {
    const filtered = state.entries.filter(e => e.gameId !== gameId);
    return { ...state, entries: [...filtered, { gameId, dismissedAt }] };
}

export function isBoxExpired(entry, now, cooldownDays = BOX_COOLDOWN_DAYS) {
    const dismissed = new Date(entry.dismissedAt);
    const diffMs = now.getTime() - dismissed.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= cooldownDays;
}

export function getActiveBoxIds(state, now) {
    return state.entries
        .filter(entry => !isBoxExpired(entry, now))
        .map(entry => entry.gameId);
}
