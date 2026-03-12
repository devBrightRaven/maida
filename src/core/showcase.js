export const MAX_SHOWCASE = 15;

export function createEmptyShowcase() {
    return { games: [] };
}

export function addToShowcase(state, gameId) {
    if (state.games.includes(gameId)) return state;
    if (state.games.length >= MAX_SHOWCASE) return state;
    return { ...state, games: [...state.games, gameId] };
}

export function removeFromShowcase(state, gameId) {
    return { ...state, games: state.games.filter(id => id !== gameId) };
}

export function isShowcaseFull(state) {
    return state.games.length >= MAX_SHOWCASE;
}

export function markCompleted(state, gameId) {
    return removeFromShowcase(state, gameId);
}
