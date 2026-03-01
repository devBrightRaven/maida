import { describe, it, expect } from 'vitest';
import {
    applyTryScore,
    applySkipScore,
    updateGameScore,
    mergePenalties,
    removeFromSkipSets,
    mergeExcludeAppId,
    isFirstRun,
    resetAllScores,
    SCORE_MAX,
    SCORE_MIN,
    PENALTY_CAP
} from '../../core/session-logic';

// --- Helpers ---
const makeGame = (id, score = 0) => ({ id, title: `Game ${id}`, score });

// =============================================================
// applyTryScore
// =============================================================
describe('applyTryScore', () => {
    it('adds +1 to current score', () => {
        expect(applyTryScore(0)).toBe(1);
    });

    it('adds +1 to negative score', () => {
        expect(applyTryScore(-2)).toBe(-1);
    });

    it('caps at SCORE_MAX (3)', () => {
        expect(applyTryScore(2.5)).toBe(SCORE_MAX);
        expect(applyTryScore(3)).toBe(SCORE_MAX);
    });

    it('treats null/undefined as 0', () => {
        expect(applyTryScore(null)).toBe(1);
        expect(applyTryScore(undefined)).toBe(1);
    });
});

// =============================================================
// applySkipScore
// =============================================================
describe('applySkipScore', () => {
    it('subtracts 2 from current score', () => {
        expect(applySkipScore(0)).toBe(-2);
    });

    it('subtracts from positive score', () => {
        expect(applySkipScore(1.5)).toBeCloseTo(-0.5);
    });

    it('floors at SCORE_MIN (-3)', () => {
        expect(applySkipScore(-2)).toBe(SCORE_MIN);
        expect(applySkipScore(-3)).toBe(SCORE_MIN);
    });

    it('treats null/undefined as 0', () => {
        expect(applySkipScore(null)).toBe(-2);
        expect(applySkipScore(undefined)).toBe(-2);
    });
});

// =============================================================
// updateGameScore
// =============================================================
describe('updateGameScore', () => {
    it('applies score function only to matching game', () => {
        const games = [makeGame('a', 0), makeGame('b', 1)];
        const result = updateGameScore(games, 'a', applyTryScore);
        expect(result[0].score).toBe(1);
        expect(result[1].score).toBe(1); // unchanged
    });

    it('returns new array (immutable)', () => {
        const games = [makeGame('a', 0)];
        const result = updateGameScore(games, 'a', applyTryScore);
        expect(result).not.toBe(games);
        expect(result[0]).not.toBe(games[0]);
    });

    it('leaves all games unchanged if id not found', () => {
        const games = [makeGame('a', 0)];
        const result = updateGameScore(games, 'nonexistent', applyTryScore);
        expect(result[0].score).toBe(0);
    });
});

// =============================================================
// mergePenalties
// =============================================================
describe('mergePenalties', () => {
    it('appends new IDs to existing penalties', () => {
        const result = mergePenalties(['a', 'b'], ['c']);
        expect(result).toEqual(['a', 'b', 'c']);
    });

    it('refreshes position of existing ID (moves to end)', () => {
        const result = mergePenalties(['a', 'b', 'c'], ['a']);
        expect(result).toEqual(['b', 'c', 'a']);
    });

    it('caps at PENALTY_CAP (5)', () => {
        const existing = ['a', 'b', 'c', 'd'];
        const result = mergePenalties(existing, ['e', 'f']);
        expect(result).toHaveLength(PENALTY_CAP);
        expect(result).toEqual(['b', 'c', 'd', 'e', 'f']);
    });

    it('returns existing penalties when history is empty', () => {
        const existing = ['a', 'b'];
        expect(mergePenalties(existing, [])).toEqual(['a', 'b']);
        expect(mergePenalties(existing, null)).toEqual(['a', 'b']);
    });

    it('handles null existing penalties', () => {
        expect(mergePenalties(null, ['a'])).toEqual(['a']);
    });

    it('handles both null', () => {
        expect(mergePenalties(null, null)).toEqual([]);
    });
});

// =============================================================
// removeFromSkipSets
// =============================================================
describe('removeFromSkipSets', () => {
    it('removes game from both sets', () => {
        const result = removeFromSkipSets(['a', 'b', 'c'], ['a', 'b'], 'b');
        expect(result.skippedSet).toEqual(['a', 'c']);
        expect(result.skippedHistory).toEqual(['a']);
    });

    it('handles game not in sets', () => {
        const result = removeFromSkipSets(['a'], ['a'], 'x');
        expect(result.skippedSet).toEqual(['a']);
        expect(result.skippedHistory).toEqual(['a']);
    });

    it('handles empty sets', () => {
        const result = removeFromSkipSets([], [], 'a');
        expect(result.skippedSet).toEqual([]);
        expect(result.skippedHistory).toEqual([]);
    });
});

// =============================================================
// mergeExcludeAppId
// =============================================================
describe('mergeExcludeAppId', () => {
    it('adds steamAppId to existing exclude list', () => {
        const result = mergeExcludeAppId({ exclude_appids: ['100'] }, '200');
        expect(result.exclude_appids).toEqual(['100', '200']);
    });

    it('deduplicates', () => {
        const result = mergeExcludeAppId({ exclude_appids: ['100'] }, '100');
        expect(result.exclude_appids).toEqual(['100']);
    });

    it('handles null constraints', () => {
        const result = mergeExcludeAppId(null, '100');
        expect(result.exclude_appids).toEqual(['100']);
    });

    it('preserves other constraint fields', () => {
        const result = mergeExcludeAppId({ exclude_appids: [], otherField: true }, '100');
        expect(result.otherField).toBe(true);
    });
});

// =============================================================
// isFirstRun
// =============================================================
describe('isFirstRun', () => {
    it('returns true for null', () => {
        expect(isFirstRun(null)).toBe(true);
    });

    it('returns true for missing games array', () => {
        expect(isFirstRun({ source: 'steam' })).toBe(true);
    });

    it('returns true for uninitialized source', () => {
        expect(isFirstRun({ source: 'uninitialized', games: [] })).toBe(true);
    });

    it('returns true for empty games array', () => {
        expect(isFirstRun({ source: 'steam', games: [] })).toBe(true);
    });

    it('returns false for populated games', () => {
        expect(isFirstRun({ source: 'steam', games: [makeGame('a')] })).toBe(false);
    });
});

// =============================================================
// resetAllScores
// =============================================================
describe('resetAllScores', () => {
    it('sets all scores to 0', () => {
        const games = [makeGame('a', 2.5), makeGame('b', -1.5)];
        const result = resetAllScores(games);
        expect(result[0].score).toBe(0);
        expect(result[1].score).toBe(0);
    });

    it('returns new array (immutable)', () => {
        const games = [makeGame('a', 1)];
        const result = resetAllScores(games);
        expect(result).not.toBe(games);
        expect(result[0]).not.toBe(games[0]);
    });

    it('preserves other fields', () => {
        const games = [{ id: 'a', title: 'Test', score: 2, steamAppId: '123' }];
        const result = resetAllScores(games);
        expect(result[0].title).toBe('Test');
        expect(result[0].steamAppId).toBe('123');
    });
});
