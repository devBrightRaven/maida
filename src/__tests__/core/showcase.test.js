import { describe, it, expect } from 'vitest';
import {
    MAX_SHOWCASE,
    addToShowcase,
    removeFromShowcase,
    isShowcaseFull,
    markCompleted,
    createEmptyShowcase,
} from '../../core/showcase.js';

const EMPTY = createEmptyShowcase();

describe('createEmptyShowcase', () => {
    it('returns state with empty games array', () => {
        expect(EMPTY).toEqual({ games: [] });
    });
});

describe('MAX_SHOWCASE', () => {
    it('is 15', () => {
        expect(MAX_SHOWCASE).toBe(15);
    });
});

describe('addToShowcase', () => {
    it('adds a game ID to the end', () => {
        const result = addToShowcase(EMPTY, 'game1');
        expect(result.games).toEqual(['game1']);
    });

    it('returns a new object (no mutation)', () => {
        const result = addToShowcase(EMPTY, 'game1');
        expect(result).not.toBe(EMPTY);
        expect(EMPTY.games).toEqual([]);
    });

    it('appends to existing games', () => {
        const state = { games: ['a', 'b'] };
        const result = addToShowcase(state, 'c');
        expect(result.games).toEqual(['a', 'b', 'c']);
    });

    it('is a no-op for duplicate game ID', () => {
        const state = { games: ['a', 'b'] };
        const result = addToShowcase(state, 'b');
        expect(result.games).toEqual(['a', 'b']);
    });

    it('rejects addition when showcase is full (15)', () => {
        const full = { games: Array.from({ length: 15 }, (_, i) => `g${i}`) };
        const result = addToShowcase(full, 'new');
        expect(result.games).toHaveLength(15);
        expect(result.games).not.toContain('new');
    });
});

describe('removeFromShowcase', () => {
    it('removes a game ID', () => {
        const state = { games: ['a', 'b', 'c'] };
        const result = removeFromShowcase(state, 'b');
        expect(result.games).toEqual(['a', 'c']);
    });

    it('returns a new object (no mutation)', () => {
        const state = { games: ['a'] };
        const result = removeFromShowcase(state, 'a');
        expect(result).not.toBe(state);
        expect(state.games).toEqual(['a']);
    });

    it('is a no-op for non-existent game ID', () => {
        const state = { games: ['a', 'b'] };
        const result = removeFromShowcase(state, 'z');
        expect(result.games).toEqual(['a', 'b']);
    });
});

describe('isShowcaseFull', () => {
    it('returns false when under capacity', () => {
        expect(isShowcaseFull({ games: ['a'] })).toBe(false);
    });

    it('returns true at capacity', () => {
        const full = { games: Array.from({ length: 15 }, (_, i) => `g${i}`) };
        expect(isShowcaseFull(full)).toBe(true);
    });

    it('returns false when empty', () => {
        expect(isShowcaseFull(EMPTY)).toBe(false);
    });
});

describe('markCompleted', () => {
    it('removes game from showcase', () => {
        const state = { games: ['a', 'b', 'c'] };
        const result = markCompleted(state, 'b');
        expect(result.games).toEqual(['a', 'c']);
    });

    it('returns a new object (no mutation)', () => {
        const state = { games: ['a'] };
        const result = markCompleted(state, 'a');
        expect(result).not.toBe(state);
    });
});
