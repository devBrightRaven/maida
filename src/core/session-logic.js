/**
 * Session Logic — Pure functions extracted from useMaidaSession.
 * No React, no side effects, no IPC. Fully testable.
 */

// Score bounds (Design Constitution §5)
const SCORE_MAX = 3;
const SCORE_MIN = -3;
const TRY_DELTA = 1;
const SKIP_DELTA = -2;
const PENALTY_CAP = 5;

/**
 * TRY: Commitment under uncertainty → score +1, capped at SCORE_MAX.
 */
export function applyTryScore(currentScore) {
    return Math.min(SCORE_MAX, (currentScore || 0) + TRY_DELTA);
}

/**
 * NOT NOW: Behavioral signal → score -2, floored at SCORE_MIN.
 */
export function applySkipScore(currentScore) {
    return Math.max(SCORE_MIN, (currentScore || 0) + SKIP_DELTA);
}

/**
 * Apply a score delta to a specific game in the games array.
 * Returns a new array (immutable).
 */
export function updateGameScore(games, gameId, scoreFn) {
    return games.map(g => {
        if (g.id === gameId) {
            return { ...g, score: scoreFn(g.score) };
        }
        return g;
    });
}

/**
 * Merge session skip history into the persistent return penalty set.
 * - Refreshes position of existing IDs (move to end)
 * - Keeps only the last PENALTY_CAP entries (most recent)
 * - Returns new array (immutable)
 */
export function mergePenalties(existingPenalties, sessionSkippedHistory) {
    if (!sessionSkippedHistory || sessionSkippedHistory.length === 0) {
        return existingPenalties || [];
    }

    const merged = [...(existingPenalties || [])];

    sessionSkippedHistory.forEach(id => {
        const idx = merged.indexOf(id);
        if (idx > -1) merged.splice(idx, 1);
        merged.push(id);
    });

    return merged.slice(-PENALTY_CAP);
}

/**
 * Remove a game ID from both session skipped set and history.
 * Used by UNDO action.
 */
export function removeFromSkipSets(sessionSkippedSet, sessionSkippedHistory, gameId) {
    return {
        skippedSet: sessionSkippedSet.filter(id => id !== gameId),
        skippedHistory: sessionSkippedHistory.filter(id => id !== gameId)
    };
}

/**
 * Merge a steamAppId into the exclude list (deduplicated).
 * Used by the Hide Game action.
 */
export function mergeExcludeAppId(constraints, steamAppId) {
    const current = constraints || { exclude_appids: [] };
    return {
        ...current,
        exclude_appids: [...new Set([...(current.exclude_appids || []), steamAppId])]
    };
}

/**
 * Check if this is a first-run state (no games loaded yet).
 */
export function isFirstRun(gamesData) {
    return !gamesData || !gamesData.games || gamesData.source === 'uninitialized' || gamesData.games.length === 0;
}

/**
 * Reset all game scores to 0. Returns a new games array (immutable).
 */
export function resetAllScores(games) {
    return games.map(g => ({ ...g, score: 0 }));
}

// Export constants for tests
export { SCORE_MAX, SCORE_MIN, TRY_DELTA, SKIP_DELTA, PENALTY_CAP };
