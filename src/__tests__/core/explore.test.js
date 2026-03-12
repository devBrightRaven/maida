import { describe, it, expect } from 'vitest';
import {
    DAILY_EXPLORE_LIMIT,
    createExploreState,
    canExploreMore,
    recordCardShown,
    resetDailyExplore,
} from '../../core/explore.js';

describe('DAILY_EXPLORE_LIMIT', () => {
    it('is 10', () => {
        expect(DAILY_EXPLORE_LIMIT).toBe(10);
    });
});

describe('createExploreState', () => {
    it('returns state with zero cards and today date', () => {
        const state = createExploreState('2026-03-12');
        expect(state).toEqual({ lastSessionDate: '2026-03-12', cardsShownToday: 0 });
    });
});

describe('canExploreMore', () => {
    it('returns true when under limit', () => {
        const state = { lastSessionDate: '2026-03-12', cardsShownToday: 5 };
        expect(canExploreMore(state)).toBe(true);
    });

    it('returns false at limit', () => {
        const state = { lastSessionDate: '2026-03-12', cardsShownToday: 10 };
        expect(canExploreMore(state)).toBe(false);
    });

    it('returns true when zero cards shown', () => {
        const state = { lastSessionDate: '2026-03-12', cardsShownToday: 0 };
        expect(canExploreMore(state)).toBe(true);
    });
});

describe('recordCardShown', () => {
    it('increments cardsShownToday by 1', () => {
        const state = { lastSessionDate: '2026-03-12', cardsShownToday: 3 };
        const result = recordCardShown(state);
        expect(result.cardsShownToday).toBe(4);
    });

    it('returns a new object (no mutation)', () => {
        const state = { lastSessionDate: '2026-03-12', cardsShownToday: 0 };
        const result = recordCardShown(state);
        expect(result).not.toBe(state);
        expect(state.cardsShownToday).toBe(0);
    });
});

describe('resetDailyExplore', () => {
    it('resets counter when date changes', () => {
        const state = { lastSessionDate: '2026-03-11', cardsShownToday: 8 };
        const result = resetDailyExplore(state, '2026-03-12');
        expect(result.cardsShownToday).toBe(0);
        expect(result.lastSessionDate).toBe('2026-03-12');
    });

    it('does not reset when same date', () => {
        const state = { lastSessionDate: '2026-03-12', cardsShownToday: 5 };
        const result = resetDailyExplore(state, '2026-03-12');
        expect(result.cardsShownToday).toBe(5);
    });

    it('returns a new object (no mutation)', () => {
        const state = { lastSessionDate: '2026-03-11', cardsShownToday: 8 };
        const result = resetDailyExplore(state, '2026-03-12');
        expect(result).not.toBe(state);
    });
});
