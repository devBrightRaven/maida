import { describe, it, expect } from 'vitest';
import {
    MAX_KATAS,
    MAX_KATA_GAMES,
    createKata,
    deleteKata,
    addGameToKata,
    removeGameFromKata,
    renameKata,
    isKataFull,
    getUncategorizedGames,
} from '../../core/katas.js';

describe('createKata', () => {
    it('creates a kata with id, name, and empty gameIds', () => {
        const k = createKata('RPG Marathon');
        expect(k).toHaveProperty('id');
        expect(k.name).toBe('RPG Marathon');
        expect(k.gameIds).toEqual([]);
    });

    it('trims whitespace from name', () => {
        const k = createKata('  Chill Games  ');
        expect(k.name).toBe('Chill Games');
    });

    it('returns null for empty string', () => {
        expect(createKata('')).toBeNull();
        expect(createKata('   ')).toBeNull();
    });

    it('returns null for non-string input', () => {
        expect(createKata(null)).toBeNull();
        expect(createKata(undefined)).toBeNull();
        expect(createKata(42)).toBeNull();
    });

    it('generates unique ids', () => {
        const a = createKata('A');
        const b = createKata('B');
        expect(a.id).not.toBe(b.id);
    });
});

describe('deleteKata', () => {
    it('removes the kata by id', () => {
        const katas = [
            { id: 'k-1', name: 'A', gameIds: [] },
            { id: 'k-2', name: 'B', gameIds: [] },
        ];
        const result = deleteKata(katas, 'k-1');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('k-2');
    });

    it('returns same array if id not found', () => {
        const katas = [{ id: 'k-1', name: 'A', gameIds: [] }];
        const result = deleteKata(katas, 'nonexistent');
        expect(result).toHaveLength(1);
    });
});

describe('addGameToKata', () => {
    it('adds a game id', () => {
        const k = { id: 'k-1', name: 'Test', gameIds: ['g1'] };
        const result = addGameToKata(k, 'g2');
        expect(result.gameIds).toEqual(['g1', 'g2']);
    });

    it('does not duplicate', () => {
        const k = { id: 'k-1', name: 'Test', gameIds: ['g1'] };
        const result = addGameToKata(k, 'g1');
        expect(result.gameIds).toEqual(['g1']);
        expect(result).toBe(k);
    });

    it('respects MAX_KATA_GAMES limit', () => {
        let k = createKata('test');
        for (let i = 0; i < MAX_KATA_GAMES; i++) {
            k = addGameToKata(k, `game-${i}`);
        }
        expect(k.gameIds).toHaveLength(MAX_KATA_GAMES);
        const over = addGameToKata(k, 'game-extra');
        expect(over.gameIds).toHaveLength(MAX_KATA_GAMES);
        expect(over).toBe(k); // same reference
    });

    it('returns kata unchanged for null gameId', () => {
        const k = { id: 'k-1', name: 'Test', gameIds: [] };
        expect(addGameToKata(k, null)).toBe(k);
        expect(addGameToKata(k, undefined)).toBe(k);
    });
});

describe('removeGameFromKata', () => {
    it('removes a game id', () => {
        const k = { id: 'k-1', name: 'Test', gameIds: ['g1', 'g2', 'g3'] };
        const result = removeGameFromKata(k, 'g2');
        expect(result.gameIds).toEqual(['g1', 'g3']);
    });

    it('returns unchanged if game not in kata', () => {
        const k = { id: 'k-1', name: 'Test', gameIds: ['g1'] };
        const result = removeGameFromKata(k, 'g99');
        expect(result.gameIds).toEqual(['g1']);
    });

    it('returns kata unchanged for null/undefined args', () => {
        const k = { id: 'k-1', name: 'Test', gameIds: ['g1'] };
        expect(removeGameFromKata(null, 'g1')).toBe(null);
        expect(removeGameFromKata(k, null)).toBe(k);
        expect(removeGameFromKata(k, undefined)).toBe(k);
    });
});

describe('renameKata', () => {
    it('renames a kata', () => {
        const k = { id: 'k-1', name: 'Old', gameIds: ['g1'] };
        const result = renameKata(k, 'New Name');
        expect(result.name).toBe('New Name');
        expect(result.gameIds).toEqual(['g1']);
    });

    it('trims whitespace', () => {
        const k = { id: 'k-1', name: 'Old', gameIds: [] };
        expect(renameKata(k, '  Trimmed  ').name).toBe('Trimmed');
    });

    it('returns unchanged for empty name', () => {
        const k = { id: 'k-1', name: 'Keep', gameIds: [] };
        expect(renameKata(k, '').name).toBe('Keep');
        expect(renameKata(k, '   ').name).toBe('Keep');
    });
});

describe('isKataFull', () => {
    it('returns true at MAX_KATA_GAMES', () => {
        let k = createKata('test');
        for (let i = 0; i < MAX_KATA_GAMES; i++) {
            k = addGameToKata(k, `game-${i}`);
        }
        expect(isKataFull(k)).toBe(true);
    });

    it('returns false below limit', () => {
        const k = createKata('test');
        expect(isKataFull(k)).toBe(false);
    });

    it('returns false for null', () => {
        expect(isKataFull(null)).toBe(false);
    });
});

describe('getUncategorizedGames', () => {
    it('returns installed games not in any kata', () => {
        const allGames = [
            { id: 'a', installed: true },
            { id: 'b', installed: true },
            { id: 'c', installed: false },
            { id: 'd', installed: true },
        ];
        const katas = [
            { id: 'k1', name: 'RPG', gameIds: ['a'] },
        ];
        const result = getUncategorizedGames(allGames, katas);
        expect(result.map(g => g.id)).toEqual(['b', 'd']);
    });

    it('returns all installed when no katas', () => {
        const allGames = [
            { id: 'a', installed: true },
            { id: 'b', installed: false },
        ];
        const result = getUncategorizedGames(allGames, []);
        expect(result.map(g => g.id)).toEqual(['a']);
    });

    it('returns empty when all categorized', () => {
        const allGames = [
            { id: 'a', installed: true },
        ];
        const katas = [
            { id: 'k1', name: 'All', gameIds: ['a'] },
        ];
        expect(getUncategorizedGames(allGames, katas)).toEqual([]);
    });

    it('handles null katas', () => {
        const allGames = [{ id: 'a', installed: true }];
        const result = getUncategorizedGames(allGames, null);
        expect(result.map(g => g.id)).toEqual(['a']);
    });
});

describe('MAX_KATAS', () => {
    it('is 2', () => {
        expect(MAX_KATAS).toBe(2);
    });
});
