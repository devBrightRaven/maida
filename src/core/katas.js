export const MAX_KATAS = 2;
export const MAX_KATAS_LIMIT = 10;
export const MAX_KATA_GAMES = 15;

export function createKata(name) {
    if (!name || typeof name !== 'string') return null;
    const trimmed = name.trim();
    if (trimmed.length === 0) return null;
    return { id: crypto.randomUUID(), name: trimmed, gameIds: [] };
}

export function deleteKata(katas, kataId) {
    return katas.filter(k => k.id !== kataId);
}

export function addGameToKata(kata, gameId) {
    if (!kata || !gameId) return kata;
    if (kata.gameIds.includes(gameId)) return kata;
    if (kata.gameIds.length >= MAX_KATA_GAMES) return kata;
    return { ...kata, gameIds: [...kata.gameIds, gameId] };
}

export function removeGameFromKata(kata, gameId) {
    if (!kata || !gameId) return kata;
    return { ...kata, gameIds: kata.gameIds.filter(id => id !== gameId) };
}

export function renameKata(kata, newName) {
    if (!kata || !newName || typeof newName !== 'string') return kata;
    const trimmed = newName.trim();
    if (trimmed.length === 0) return kata;
    return { ...kata, name: trimmed };
}

export function isKataFull(kata) {
    if (!kata) return false;
    return kata.gameIds.length >= MAX_KATA_GAMES;
}

/**
 * Get installed games that aren't in any kata.
 */
export function getUncategorizedGames(allGames, katas) {
    const categorized = new Set();
    (katas || []).forEach(k => k.gameIds.forEach(id => categorized.add(id)));
    return allGames.filter(g => g.installed && !categorized.has(g.id));
}
