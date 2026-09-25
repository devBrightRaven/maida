import { describe, it, expect } from 'vitest';
import { bucketGames, NOW_CAP, RECENTLY_ARRIVED_CAP } from '../../core/zones.js';

function makeGame(overrides = {}) {
    return {
        id: 'g-1',
        title: 'Game',
        installed: true,
        steamLastPlayed: 0,
        importedAt: '2026-08-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('bucketGames NOW', () => {
    it('contains played games sorted by steamLastPlayed desc, capped at 5', () => {
        const games = [1, 2, 3, 4, 5, 6, 7].map(n => makeGame({ id: `g-${n}`, steamLastPlayed: n * 100 }));
        const { now } = bucketGames({ games, hooksState: null });
        expect(now).toHaveLength(NOW_CAP);
        expect(now.map(g => g.id)).toEqual(['g-7', 'g-6', 'g-5', 'g-4', 'g-3']);
    });

    it('excludes never-played, resting, and released games', () => {
        const games = [
            makeGame({ id: 'never', steamLastPlayed: 0 }),
            makeGame({ id: 'missing', steamLastPlayed: undefined }),
            makeGame({ id: 'resting', steamLastPlayed: 100 }),
            makeGame({ id: 'gone', steamLastPlayed: 200 }),
            makeGame({ id: 'playing', steamLastPlayed: 300 }),
        ];
        const hooksState = { hooks: [], gameStates: { resting: 'rest', gone: 'released' } };
        const { now } = bucketGames({ games, hooksState });
        expect(now.map(g => g.id)).toEqual(['playing']);
    });

    it('keeps games explicitly marked keep', () => {
        const games = [makeGame({ id: 'kept', steamLastPlayed: 100 })];
        const { now } = bucketGames({ games, hooksState: { hooks: [], gameStates: { kept: 'keep' } } });
        expect(now.map(g => g.id)).toEqual(['kept']);
    });

    // LastPlayed data contract (P0-1): an explicit 'invalid' status is not a
    // recorded timestamp, even though a stray positive-looking raw field
    // would have passed the old `> 0` check.
    it('excludes a game whose status is invalid even if steamLastPlayed looks nonzero', () => {
        const games = [makeGame({ id: 'bad', steamLastPlayed: 500, steamLastPlayedStatus: 'invalid' })];
        const { now } = bucketGames({ games, hooksState: null });
        expect(now).toEqual([]);
    });
});

describe('bucketGames STILL_HERE', () => {
    const games = [
        makeGame({ id: 'g-1', steamLastPlayed: 100 }),
        makeGame({ id: 'g-2', steamLastPlayed: 0 }),
    ];

    it('joins active hooks to games, newest hook first, no cap', () => {
        const hooks = [
            { id: 'h-1', gameId: 'g-1', note: 'a', createdAt: '2026-08-01T00:00:00.000Z', status: 'active', traceEventId: 'e1' },
            { id: 'h-2', gameId: 'g-2', note: 'b', createdAt: '2026-08-02T00:00:00.000Z', status: 'active', traceEventId: 'e2' },
        ];
        const { stillHere } = bucketGames({ games, hooksState: { hooks, gameStates: {} } });
        expect(stillHere.map(x => x.hook.id)).toEqual(['h-2', 'h-1']);
        expect(stillHere[0].game.id).toBe('g-2');
        expect(stillHere[1].game.id).toBe('g-1');
    });

    it('excludes retracted hooks and hooks whose game is missing', () => {
        const hooks = [
            { id: 'h-1', gameId: 'g-1', note: 'a', createdAt: 'x', status: 'retracted', traceEventId: 'e1' },
            { id: 'h-2', gameId: 'g-unknown', note: 'b', createdAt: 'x', status: 'active', traceEventId: 'e2' },
        ];
        const { stillHere } = bucketGames({ games, hooksState: { hooks, gameStates: {} } });
        expect(stillHere).toEqual([]);
    });

    it('includes hooks on resting games (explicit intent outlives resting)', () => {
        const hooks = [
            { id: 'h-1', gameId: 'g-1', note: 'a', createdAt: 'x', status: 'active', traceEventId: 'e1' },
        ];
        const { stillHere, now } = bucketGames({ games, hooksState: { hooks, gameStates: { 'g-1': 'rest' } } });
        expect(stillHere.map(x => x.hook.id)).toEqual(['h-1']);
        expect(now).toEqual([]); // resting still excluded from NOW
    });
});

describe('bucketGames RECENTLY_ARRIVED', () => {
    // Contract change (P0-1): RECENTLY_ARRIVED now requires a PROVEN zero
    // (lastPlayedState kind 'zero' — the ACF field was present and read 0),
    // not "anything not > 0". A fresh scan sets steamLastPlayedStatus
    // explicitly, so these games carry it.
    it('contains zero-status installed games sorted by importedAt desc, capped at 5', () => {
        const games = [1, 2, 3, 4, 5, 6].map(n => makeGame({
            id: `g-${n}`,
            steamLastPlayed: 0,
            steamLastPlayedStatus: 'zero',
            importedAt: `2026-08-0${n}T00:00:00.000Z`,
        }));
        const { recentlyArrived } = bucketGames({ games, hooksState: null });
        expect(recentlyArrived).toHaveLength(RECENTLY_ARRIVED_CAP);
        expect(recentlyArrived.map(g => g.id)).toEqual(['g-6', 'g-5', 'g-4', 'g-3', 'g-2']);
    });

    // Changed from "treats a missing steamLastPlayed as never played" to the
    // opposite assertion: missing/invalid/legacy-0 games are UNKNOWN, not
    // proven unplayed, so the contract forbids claiming them as never played.
    // Only an explicit 'zero' status qualifies.
    it('excludes games whose lastPlayed status is unknown (missing, invalid, or legacy-0) — unknown is not proven unplayed', () => {
        const games = [
            makeGame({ id: 'no-status', steamLastPlayed: 0 }), // legacy, no explicit status
            makeGame({ id: 'missing-status', steamLastPlayed: 0, steamLastPlayedStatus: 'missing' }),
            makeGame({ id: 'invalid-status', steamLastPlayed: 0, steamLastPlayedStatus: 'invalid' }),
            makeGame({ id: 'zero-status', steamLastPlayed: 0, steamLastPlayedStatus: 'zero' }),
        ];
        const { recentlyArrived } = bucketGames({ games, hooksState: null });
        expect(recentlyArrived.map(g => g.id)).toEqual(['zero-status']);
    });

    it('excludes played, uninstalled, resting, and released games', () => {
        const games = [
            makeGame({ id: 'played', steamLastPlayed: 100 }),
            makeGame({ id: 'not-installed', installed: false, steamLastPlayedStatus: 'zero' }),
            makeGame({ id: 'resting', steamLastPlayedStatus: 'zero' }),
            makeGame({ id: 'gone', steamLastPlayedStatus: 'zero' }),
            makeGame({ id: 'fresh', steamLastPlayedStatus: 'zero' }),
        ];
        const hooksState = { hooks: [], gameStates: { resting: 'rest', gone: 'released' } };
        const { recentlyArrived } = bucketGames({ games, hooksState });
        expect(recentlyArrived.map(g => g.id)).toEqual(['fresh']);
    });

    it('tolerates missing importedAt', () => {
        const games = [
            makeGame({ id: 'dated', steamLastPlayedStatus: 'zero' }),
            makeGame({ id: 'undated', steamLastPlayedStatus: 'zero', importedAt: undefined }),
        ];
        const { recentlyArrived } = bucketGames({ games, hooksState: null });
        expect(recentlyArrived.map(g => g.id)).toEqual(['dated', 'undated']);
    });
});

describe('bucketGames robustness', () => {
    it('returns empty zones for missing input', () => {
        expect(bucketGames()).toEqual({ now: [], stillHere: [], recentlyArrived: [] });
        expect(bucketGames({})).toEqual({ now: [], stillHere: [], recentlyArrived: [] });
        expect(bucketGames({ games: null, hooksState: null })).toEqual({ now: [], stillHere: [], recentlyArrived: [] });
    });

    it('skips null game entries', () => {
        const games = [null, makeGame({ id: 'g-1', steamLastPlayed: 100 }), undefined];
        const { now } = bucketGames({ games, hooksState: null });
        expect(now.map(g => g.id)).toEqual(['g-1']);
    });

    it('does not mutate the input arrays', () => {
        const games = [
            makeGame({ id: 'g-1', steamLastPlayed: 100 }),
            makeGame({ id: 'g-2', steamLastPlayed: 200 }),
        ];
        const hooks = [
            { id: 'h-1', gameId: 'g-1', note: 'a', createdAt: '2026-08-01', status: 'active', traceEventId: 'e1' },
            { id: 'h-2', gameId: 'g-2', note: 'b', createdAt: '2026-08-02', status: 'active', traceEventId: 'e2' },
        ];
        bucketGames({ games, hooksState: { hooks, gameStates: {} } });
        expect(games.map(g => g.id)).toEqual(['g-1', 'g-2']);
        expect(hooks.map(h => h.id)).toEqual(['h-1', 'h-2']);
    });
});
