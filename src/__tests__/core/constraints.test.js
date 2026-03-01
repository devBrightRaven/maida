import { describe, it, expect } from 'vitest';
import { applyConstraints } from '../../core/constraints';

function makeGame(overrides = {}) {
    return {
        id: overrides.id || 'game-test',
        title: overrides.title || 'Test Game',
        installed: true,
        score: 0,
        steamAppId: overrides.steamAppId || '1000',
        ...overrides,
    };
}

function makeGamesData(games) {
    return { schemaVersion: '0.2.2', source: 'test', games };
}

describe('applyConstraints', () => {
    it('returns gamesData unchanged when constraints is null', () => {
        const gamesData = makeGamesData([makeGame()]);
        const result = applyConstraints(gamesData, null);
        expect(result).toBe(gamesData); // Same reference
    });

    it('filters games by exclude_appids', () => {
        const games = [
            makeGame({ id: 'keep', steamAppId: '100' }),
            makeGame({ id: 'exclude', steamAppId: '200' }),
            makeGame({ id: 'also-keep', steamAppId: '300' }),
        ];
        const result = applyConstraints(makeGamesData(games), {
            exclude_appids: ['200'],
        });

        expect(result.games).toHaveLength(2);
        expect(result.games.find(g => g.id === 'exclude')).toBeUndefined();
        expect(result.games.find(g => g.id === 'keep')).toBeDefined();
    });

    it('returns gamesData unchanged when exclude_appids is empty', () => {
        const gamesData = makeGamesData([makeGame(), makeGame({ id: 'b' })]);
        const result = applyConstraints(gamesData, { exclude_appids: [] });
        expect(result).toBe(gamesData); // Same reference (early return optimization)
    });

    it('returns gamesData unchanged when gamesData is null', () => {
        const result = applyConstraints(null, { exclude_appids: ['100'] });
        expect(result).toBeNull();
    });
});
