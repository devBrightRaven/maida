import { describe, it, expect } from 'vitest';
import {
    addToBox,
    isBoxExpired,
    getActiveBoxIds,
    createEmptyBox,
    BOX_COOLDOWN_DAYS,
} from '../../core/box.js';

describe('createEmptyBox', () => {
    it('returns state with empty entries array', () => {
        expect(createEmptyBox()).toEqual({ entries: [] });
    });
});

describe('BOX_COOLDOWN_DAYS', () => {
    it('is 14', () => {
        expect(BOX_COOLDOWN_DAYS).toBe(14);
    });
});

describe('addToBox', () => {
    it('adds game with timestamp', () => {
        const now = '2026-03-12T00:00:00Z';
        const result = addToBox(createEmptyBox(), 'game1', now);
        expect(result.entries).toEqual([{ gameId: 'game1', dismissedAt: now }]);
    });

    it('returns a new object (no mutation)', () => {
        const state = createEmptyBox();
        const result = addToBox(state, 'game1', '2026-03-12T00:00:00Z');
        expect(result).not.toBe(state);
        expect(state.entries).toEqual([]);
    });

    it('replaces timestamp if game already in box', () => {
        const state = { entries: [{ gameId: 'a', dismissedAt: '2026-01-01T00:00:00Z' }] };
        const result = addToBox(state, 'a', '2026-03-12T00:00:00Z');
        expect(result.entries).toHaveLength(1);
        expect(result.entries[0].dismissedAt).toBe('2026-03-12T00:00:00Z');
    });
});

describe('isBoxExpired', () => {
    it('returns false when within cooldown', () => {
        const entry = { gameId: 'a', dismissedAt: '2026-03-01T00:00:00Z' };
        const now = new Date('2026-03-10T00:00:00Z');
        expect(isBoxExpired(entry, now)).toBe(false);
    });

    it('returns true when past cooldown', () => {
        const entry = { gameId: 'a', dismissedAt: '2026-02-20T00:00:00Z' };
        const now = new Date('2026-03-12T00:00:00Z');
        expect(isBoxExpired(entry, now)).toBe(true);
    });

    it('returns true at exactly 14 days', () => {
        const entry = { gameId: 'a', dismissedAt: '2026-02-26T00:00:00Z' };
        const now = new Date('2026-03-12T00:00:00Z');
        expect(isBoxExpired(entry, now)).toBe(true);
    });
});

describe('getActiveBoxIds', () => {
    it('returns IDs of non-expired entries', () => {
        const state = {
            entries: [
                { gameId: 'recent', dismissedAt: '2026-03-10T00:00:00Z' },
                { gameId: 'old', dismissedAt: '2026-01-01T00:00:00Z' },
            ],
        };
        const now = new Date('2026-03-12T00:00:00Z');
        expect(getActiveBoxIds(state, now)).toEqual(['recent']);
    });

    it('returns empty array when all expired', () => {
        const state = {
            entries: [{ gameId: 'old', dismissedAt: '2026-01-01T00:00:00Z' }],
        };
        const now = new Date('2026-03-12T00:00:00Z');
        expect(getActiveBoxIds(state, now)).toEqual([]);
    });

    it('returns empty array for empty box', () => {
        expect(getActiveBoxIds(createEmptyBox(), new Date())).toEqual([]);
    });
});
