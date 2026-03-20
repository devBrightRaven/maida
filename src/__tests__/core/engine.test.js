import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateTraceWeights, getActiveGame, getPrescription } from '../../core/engine';
import { debugStore } from '../../core/debugStore';

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

function makeGame(overrides = {}) {
    const id = overrides.id || 'game-' + Math.random().toString(36).slice(2, 6);
    return {
        id,
        title: overrides.title || id,
        installed: true,
        score: 0,
        steamAppId: overrides.steamAppId || '1000',
        lastPlayed: 'Never',
        ...overrides,
    };
}

function makeGamesData(games) {
    return { schemaVersion: '0.2.2', source: 'test', games };
}

function makePrescriptionsData(overrides = {}) {
    return {
        prescriptions: {
            default: [
                { text: 'default-unlock', momentum: 'unlock' },
                { text: 'default-stabilize', momentum: 'stabilize' },
            ],
            idle_state: [
                { text: 'idle-prescription' },
            ],
            catalog: {},
            ...overrides,
        },
    };
}

// ---------------------------------------------------------------------------
// calculateTraceWeights
// ---------------------------------------------------------------------------

describe('calculateTraceWeights', () => {
    it('returns equal weights for games with equal scores', () => {
        const games = [
            makeGame({ id: 'a', score: 0 }),
            makeGame({ id: 'b', score: 0 }),
            makeGame({ id: 'c', score: 0 }),
        ];
        const result = calculateTraceWeights(makeGamesData(games));

        expect(result).not.toBeNull();
        expect(result.candidates).toHaveLength(3);

        const weights = result.candidates.map(c => c.weight);
        // All weights should be identical (exp(0/temp) = 1.0)
        expect(weights[0]).toBeCloseTo(weights[1]);
        expect(weights[1]).toBeCloseTo(weights[2]);
    });

    it('excludes session-skipped games with weight=0', () => {
        const games = [
            makeGame({ id: 'a', score: 0 }),
            makeGame({ id: 'skipped', score: 0 }),
            makeGame({ id: 'c', score: 0 }),
        ];
        const result = calculateTraceWeights(makeGamesData(games), {
            sessionSkippedSet: ['skipped'],
        });

        // candidates = sampling pool (excludes skipped)
        expect(result.candidates).toHaveLength(2);
        expect(result.candidates.find(c => c.id === 'skipped')).toBeUndefined();

        // traceCandidates includes all, skipped has weight 0
        const skippedTrace = result.traceCandidates.find(c => c.id === 'skipped');
        expect(skippedTrace.weight).toBe(0);
        expect(skippedTrace.isSkipped).toBe(true);
    });

    it('applies return penalty factor of 0.2', () => {
        const games = [
            makeGame({ id: 'normal', score: 0 }),
            makeGame({ id: 'penalized', score: 0 }),
        ];
        const result = calculateTraceWeights(makeGamesData(games), {
            returnPenaltySet: ['penalized'],
        });

        const normal = result.candidates.find(c => c.id === 'normal');
        const penalized = result.candidates.find(c => c.id === 'penalized');

        // Both have score=0, so base weight = exp(0/temp) = 1.0
        // Penalized: 1.0 * 0.2 = 0.2
        expect(penalized.weight).toBeCloseTo(normal.weight * 0.2);
        expect(penalized.penalty).toBe('PENALTY (0.2)');
    });

    it('computes positive weight for negative scores', () => {
        const games = [
            makeGame({ id: 'neg', score: -2 }),
        ];
        const temp = 1.5;
        const result = calculateTraceWeights(makeGamesData(games), { temperature: temp });

        const candidate = result.candidates[0];
        // exp(-2 / 1.5) ≈ 0.2636
        expect(candidate.weight).toBeCloseTo(Math.exp(-2 / temp));
        expect(candidate.weight).toBeGreaterThan(0);
    });

    it('temperature controls weight spread', () => {
        const games = [
            makeGame({ id: 'high', score: 2 }),
            makeGame({ id: 'low', score: -2 }),
        ];

        const lowTemp = calculateTraceWeights(makeGamesData(games), { temperature: 0.5 });
        const highTemp = calculateTraceWeights(makeGamesData(games), { temperature: 3.0 });

        const lowTempRatio = lowTemp.candidates.find(c => c.id === 'high').weight /
            lowTemp.candidates.find(c => c.id === 'low').weight;
        const highTempRatio = highTemp.candidates.find(c => c.id === 'high').weight /
            highTemp.candidates.find(c => c.id === 'low').weight;

        // Low temperature = more extreme spread (higher ratio)
        expect(lowTempRatio).toBeGreaterThan(highTempRatio);
    });

    it('returns null for empty game list', () => {
        expect(calculateTraceWeights(makeGamesData([]))).toBeNull();
    });

    it('returns empty candidates when all games are skipped', () => {
        const games = [
            makeGame({ id: 'a' }),
            makeGame({ id: 'b' }),
        ];
        const result = calculateTraceWeights(makeGamesData(games), {
            sessionSkippedSet: ['a', 'b'],
        });

        expect(result.candidates).toHaveLength(0);
        expect(result.traceCandidates).toHaveLength(2);
    });

    it('deduplicates games by id (keeps first occurrence)', () => {
        const games = [
            makeGame({ id: 'dup', score: 1, title: 'First' }),
            makeGame({ id: 'dup', score: 5, title: 'Second' }),
            makeGame({ id: 'unique', score: 0 }),
        ];
        const result = calculateTraceWeights(makeGamesData(games));

        // Only 2 unique games
        expect(result.candidates).toHaveLength(2);
        // First occurrence kept (score=1, not score=5)
        const dup = result.candidates.find(c => c.id === 'dup');
        expect(dup.score).toBe(1);
    });

    // --- candidatePool (Showcase mode) ---

    it('filters to candidatePool when provided', () => {
        const games = [
            makeGame({ id: 'a', installed: true }),
            makeGame({ id: 'b', installed: true }),
            makeGame({ id: 'c', installed: true }),
        ];
        const result = calculateTraceWeights(makeGamesData(games), {
            candidatePool: ['a', 'c'],
        });

        expect(result.candidates).toHaveLength(2);
        expect(result.candidates.map(c => c.id).sort()).toEqual(['a', 'c']);
    });

    it('excludes uninstalled games even when in candidatePool', () => {
        const games = [
            makeGame({ id: 'a', installed: false }),
            makeGame({ id: 'b', installed: true }),
        ];
        const result = calculateTraceWeights(makeGamesData(games), {
            candidatePool: ['a'],
        });

        // 'a' is not installed — Rin won't dice uninstalled games (they stay in Kamae showcase)
        expect(result).toBeNull();
    });

    it('returns null for empty candidatePool', () => {
        const games = [makeGame({ id: 'a' })];
        const result = calculateTraceWeights(makeGamesData(games), {
            candidatePool: [],
        });
        expect(result).toBeNull();
    });

    it('preserves existing behavior without candidatePool', () => {
        const games = [
            makeGame({ id: 'installed', installed: true }),
            makeGame({ id: 'not-installed', installed: false }),
        ];
        const result = calculateTraceWeights(makeGamesData(games));

        // Without candidatePool, only installed games
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].id).toBe('installed');
    });
});

// ---------------------------------------------------------------------------
// getActiveGame
// ---------------------------------------------------------------------------

describe('getActiveGame', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns a game that exists in the pool', () => {
        const games = [
            makeGame({ id: 'a' }),
            makeGame({ id: 'b' }),
            makeGame({ id: 'c' }),
        ];
        const gamesData = makeGamesData(games);
        const result = getActiveGame(gamesData);

        expect(result).not.toBeNull();
        expect(games.some(g => g.id === result.id)).toBe(true);
    });

    it('selects first candidate when Math.random returns 0', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);

        // Give distinct scores so weight order is deterministic
        const games = [
            makeGame({ id: 'first', score: 2 }),
            makeGame({ id: 'second', score: 0 }),
            makeGame({ id: 'third', score: -1 }),
        ];
        const result = getActiveGame(makeGamesData(games));

        // random=0 means: 0 * totalWeight = 0, first candidate's weight > 0, selected
        expect(result.id).toBe('first');
    });

    it('can select last candidate when Math.random is near 1', () => {
        // With equal scores, all weights are equal. random near 1 should hit the last.
        vi.spyOn(Math, 'random').mockReturnValue(0.999);

        const games = [
            makeGame({ id: 'a', score: 0 }),
            makeGame({ id: 'b', score: 0 }),
            makeGame({ id: 'c', score: 0 }),
        ];
        const result = getActiveGame(makeGamesData(games));

        // With equal weights and random near 1, should select last candidate
        expect(result.id).toBe('c');
    });

    it('always returns the only game in a single-game pool', () => {
        const games = [makeGame({ id: 'only' })];
        const gamesData = makeGamesData(games);

        // Run multiple times to ensure determinism
        for (let i = 0; i < 5; i++) {
            const result = getActiveGame(gamesData);
            expect(result.id).toBe('only');
        }
    });

    it('returns null and updates trace when pool is empty', () => {
        const games = [makeGame({ id: 'a' })];
        const result = getActiveGame(makeGamesData(games), {
            sessionSkippedSet: ['a'],
        });

        expect(result).toBeNull();

        // Trace should still be updated
        const trace = debugStore.getTrace();
        expect(trace).not.toBeNull();
        expect(trace.selected).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getPrescription
// ---------------------------------------------------------------------------

describe('getPrescription', () => {
    it('returns idle_state prescription when game is null', () => {
        const prescData = makePrescriptionsData();
        const result = getPrescription(null, prescData);

        expect(result).not.toBeNull();
        expect(result.text).toBe('idle-prescription');
    });

    it('returns stabilize momentum for lastPlayed="Today"', () => {
        const prescData = makePrescriptionsData();
        const game = makeGame({ lastPlayed: 'Today' });
        const result = getPrescription(game, prescData);

        expect(result.momentum).toBe('stabilize');
    });

    it('returns unlock momentum for lastPlayed="Never"', () => {
        const prescData = makePrescriptionsData();
        const game = makeGame({ lastPlayed: 'Never' });
        const result = getPrescription(game, prescData);

        expect(result.momentum).toBe('unlock');
    });

    it('returns stabilize momentum for games played within 48h', () => {
        const prescData = makePrescriptionsData();
        const recentDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
        const game = makeGame({ lastPlayed: recentDate.toISOString() });
        const result = getPrescription(game, prescData);

        expect(result.momentum).toBe('stabilize');
    });

    it('returns catalog prescription when match exists', () => {
        const prescData = makePrescriptionsData({
            catalog: {
                'my-game': [
                    { text: 'catalog-unlock', momentum: 'unlock' },
                    { text: 'catalog-stabilize', momentum: 'stabilize' },
                ],
            },
        });
        const game = makeGame({ id: 'my-game', lastPlayed: 'Never' });
        const result = getPrescription(game, prescData);

        // lastPlayed=Never -> momentum=unlock, catalog has unlock entry
        expect(result.text).toBe('catalog-unlock');
    });

    it('falls back to default when no catalog match', () => {
        const prescData = makePrescriptionsData();
        const game = makeGame({ id: 'no-catalog', lastPlayed: 'Never' });
        const result = getPrescription(game, prescData);

        expect(result.text).toBe('default-unlock');
    });
});
