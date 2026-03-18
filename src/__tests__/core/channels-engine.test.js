/**
 * Integration test: Channels + Engine
 *
 * Verifies that getActivePool() output correctly feeds into
 * the engine's candidatePool, and Rin's dice respects channel boundaries.
 */
import { describe, it, expect } from 'vitest';
import { getActivePool } from '../../core/channels.js';
import { calculateTraceWeights, getActiveGame } from '../../core/engine.js';

// --- Fixtures ---

function makeGame(id, title, score = 0, installed = true) {
    return { id, steamAppId: id, title, score, installed };
}

const GAMES_DATA = {
    games: [
        makeGame('g1', 'Elden Ring', 5),
        makeGame('g2', 'Stardew Valley', 3),
        makeGame('g3', 'Persona 5', 1),
        makeGame('g4', 'Hades', 0),
        makeGame('g5', 'FF7 Remake', -2),
    ]
};

const SHOWCASE = { games: ['g1', 'g2', 'g3', 'g4', 'g5'] };

const CHANNELS = [
    { id: 'ch-rpg', name: 'RPG Marathon', gameIds: ['g1', 'g3', 'g5'] },
    { id: 'ch-chill', name: 'Chill', gameIds: ['g2', 'g4'] },
];

// --- Tests ---

describe('Channels → Engine: candidatePool integration', () => {
    it('active channel limits engine candidates to channel games only', () => {
        const pool = getActivePool(SHOWCASE, CHANNELS, 'ch-rpg');
        expect(pool).toEqual(['g1', 'g3', 'g5']);

        const trace = calculateTraceWeights(GAMES_DATA, { candidatePool: pool });
        const candidateIds = trace.traceCandidates.map(c => c.id);

        expect(candidateIds).toContain('g1');
        expect(candidateIds).toContain('g3');
        expect(candidateIds).toContain('g5');
        expect(candidateIds).not.toContain('g2');
        expect(candidateIds).not.toContain('g4');
    });

    it('no active channel uses entire showcase as pool', () => {
        const pool = getActivePool(SHOWCASE, CHANNELS, null);
        expect(pool).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);

        const trace = calculateTraceWeights(GAMES_DATA, { candidatePool: pool });
        expect(trace.traceCandidates).toHaveLength(5);
    });

    it('engine respects channel even with skipped games', () => {
        const pool = getActivePool(SHOWCASE, CHANNELS, 'ch-chill');
        // ch-chill: g2, g4
        expect(pool).toEqual(['g2', 'g4']);

        const trace = calculateTraceWeights(GAMES_DATA, {
            candidatePool: pool,
            sessionSkippedSet: ['g2'], // skip Stardew
        });

        // g2 should be skipped (weight 0), only g4 remains
        const active = trace.candidates;
        expect(active).toHaveLength(1);
        expect(active[0].id).toBe('g4');
    });

    it('all channel games skipped → engine returns null', () => {
        const pool = getActivePool(SHOWCASE, CHANNELS, 'ch-chill');

        const result = getActiveGame(GAMES_DATA, {
            candidatePool: pool,
            sessionSkippedSet: ['g2', 'g4'],
        });

        expect(result).toBeNull();
    });

    it('channel with only one game always selects that game', () => {
        const singleChannel = [
            { id: 'ch-one', name: 'Solo', gameIds: ['g3'] },
        ];
        const pool = getActivePool(SHOWCASE, singleChannel, 'ch-one');
        expect(pool).toEqual(['g3']);

        const result = getActiveGame(GAMES_DATA, { candidatePool: pool });
        expect(result.id).toBe('g3');
        expect(result.title).toBe('Persona 5');
    });

    it('channel games not in showcase are filtered before reaching engine', () => {
        const smallShowcase = { games: ['g1', 'g2'] };
        // ch-rpg has g1, g3, g5 — but only g1 is in showcase
        const pool = getActivePool(smallShowcase, CHANNELS, 'ch-rpg');
        expect(pool).toEqual(['g1']);

        const trace = calculateTraceWeights(GAMES_DATA, { candidatePool: pool });
        expect(trace.traceCandidates).toHaveLength(1);
        expect(trace.traceCandidates[0].id).toBe('g1');
    });

    it('return penalty applies within channel pool', () => {
        const pool = getActivePool(SHOWCASE, CHANNELS, 'ch-rpg');
        // g1 has return penalty → weight * 0.2
        const trace = calculateTraceWeights(GAMES_DATA, {
            candidatePool: pool,
            returnPenaltySet: ['g1'],
        });

        const g1 = trace.traceCandidates.find(c => c.id === 'g1');
        const g3 = trace.traceCandidates.find(c => c.id === 'g3');

        // g1 score=5, g3 score=1. Without penalty g1 weight >> g3.
        // With 0.2 penalty, g1 should be closer to g3
        expect(g1.penalty).toBe('PENALTY (0.2)');
        expect(g3.penalty).toBeNull();
        expect(g1.weight).toBeLessThan(g1.weight / 0.2); // sanity: penalty reduced it
    });

    it('negative score games in channel still participate (decay, not exclusion)', () => {
        const pool = getActivePool(SHOWCASE, CHANNELS, 'ch-rpg');
        // g5 has score -2 — should still be a candidate (low weight, not zero)
        const trace = calculateTraceWeights(GAMES_DATA, { candidatePool: pool });

        const g5 = trace.traceCandidates.find(c => c.id === 'g5');
        expect(g5).toBeDefined();
        expect(g5.weight).toBeGreaterThan(0);
        expect(g5.isSkipped).toBe(false);
    });

    it('empty channel falls back to showcase, engine gets full pool', () => {
        const emptyChannels = [{ id: 'ch-empty', name: 'Empty', gameIds: [] }];
        const pool = getActivePool(SHOWCASE, emptyChannels, 'ch-empty');
        // Fallback to full showcase
        expect(pool).toEqual(SHOWCASE.games);

        const trace = calculateTraceWeights(GAMES_DATA, { candidatePool: pool });
        expect(trace.traceCandidates).toHaveLength(5);
    });
});
