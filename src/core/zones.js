/**
 * Maida 2.0 zone bucketing.
 *
 * Zone order is fixed blocks; within a block, sort ONLY by observable facts
 * (steamLastPlayed epoch, hook createdAt, importedAt). Never ranks by inference.
 */
import { lastPlayedState } from './lastPlayed.js';

export const NOW_CAP = 5;
export const RECENTLY_ARRIVED_CAP = 5;

function isRestingOrReleased(gameStates, gameId) {
    const s = gameStates[gameId];
    return s === 'rest' || s === 'released';
}

/**
 * bucketGames({ games, hooksState }) -> { now, stillHere, recentlyArrived }
 *
 * NOW: lastPlayedState kind 'recorded', not rest/released, lastPlayed desc, cap 5.
 * STILL_HERE: active hooks joined to their games, hook createdAt desc, no cap.
 *   Includes hooks on resting games (explicit intent outlives resting).
 * RECENTLY_ARRIVED: lastPlayedState kind 'zero' + installed, not rest/released,
 *   importedAt desc, cap 5. A game whose state is 'unknown' (missing/invalid/
 *   legacy) is never claimed as unplayed — see core/lastPlayed.js.
 */
export function bucketGames({ games, hooksState } = {}) {
    const list = games || [];
    const gameStates = hooksState?.gameStates || {};
    const hooks = hooksState?.hooks || [];

    const now = list
        .filter(g => g && lastPlayedState(g).kind === 'recorded' && !isRestingOrReleased(gameStates, g.id))
        .sort((a, b) => (b.steamLastPlayed || 0) - (a.steamLastPlayed || 0))
        .slice(0, NOW_CAP);

    const byId = new Map(list.filter(Boolean).map(g => [g.id, g]));
    const stillHere = hooks
        .filter(h => h && h.status === 'active' && byId.has(h.gameId))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .map(h => ({ hook: h, game: byId.get(h.gameId) }));

    const recentlyArrived = list
        .filter(g => g && lastPlayedState(g).kind === 'zero' && g.installed && !isRestingOrReleased(gameStates, g.id))
        .sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')))
        .slice(0, RECENTLY_ARRIVED_CAP);

    return { now, stillHere, recentlyArrived };
}
