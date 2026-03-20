import { describe, it, expect } from 'vitest';
import {
    MAX_CHANNELS,
    createChannel,
    deleteChannel,
    addGameToChannel,
    removeGameFromChannel,
    getActivePool,
    renameChannel,
} from '../../core/channels.js';

describe('createChannel', () => {
    it('creates a channel with id, name, and empty gameIds', () => {
        const ch = createChannel('RPG Marathon');
        expect(ch).toHaveProperty('id');
        expect(ch.name).toBe('RPG Marathon');
        expect(ch.gameIds).toEqual([]);
    });

    it('trims whitespace from name', () => {
        const ch = createChannel('  Chill Games  ');
        expect(ch.name).toBe('Chill Games');
    });

    it('returns null for empty string', () => {
        expect(createChannel('')).toBeNull();
        expect(createChannel('   ')).toBeNull();
    });

    it('returns null for non-string input', () => {
        expect(createChannel(null)).toBeNull();
        expect(createChannel(undefined)).toBeNull();
        expect(createChannel(42)).toBeNull();
    });

    it('generates unique ids', () => {
        const a = createChannel('A');
        const b = createChannel('B');
        expect(a.id).not.toBe(b.id);
    });
});

describe('deleteChannel', () => {
    it('removes the channel by id', () => {
        const channels = [
            { id: 'ch-1', name: 'A', gameIds: [] },
            { id: 'ch-2', name: 'B', gameIds: [] },
        ];
        const result = deleteChannel(channels, 'ch-1');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('ch-2');
    });

    it('returns same array if id not found', () => {
        const channels = [{ id: 'ch-1', name: 'A', gameIds: [] }];
        const result = deleteChannel(channels, 'nonexistent');
        expect(result).toHaveLength(1);
    });
});

describe('addGameToChannel', () => {
    it('adds a game id', () => {
        const ch = { id: 'ch-1', name: 'Test', gameIds: ['g1'] };
        const result = addGameToChannel(ch, 'g2');
        expect(result.gameIds).toEqual(['g1', 'g2']);
    });

    it('does not duplicate', () => {
        const ch = { id: 'ch-1', name: 'Test', gameIds: ['g1'] };
        const result = addGameToChannel(ch, 'g1');
        expect(result.gameIds).toEqual(['g1']);
        expect(result).toBe(ch); // same reference = no mutation
    });

    it('returns channel unchanged for null gameId', () => {
        const ch = { id: 'ch-1', name: 'Test', gameIds: [] };
        expect(addGameToChannel(ch, null)).toBe(ch);
        expect(addGameToChannel(ch, undefined)).toBe(ch);
    });
});

describe('removeGameFromChannel', () => {
    it('removes a game id', () => {
        const ch = { id: 'ch-1', name: 'Test', gameIds: ['g1', 'g2', 'g3'] };
        const result = removeGameFromChannel(ch, 'g2');
        expect(result.gameIds).toEqual(['g1', 'g3']);
    });

    it('returns unchanged if game not in channel', () => {
        const ch = { id: 'ch-1', name: 'Test', gameIds: ['g1'] };
        const result = removeGameFromChannel(ch, 'g99');
        expect(result.gameIds).toEqual(['g1']);
    });
});

describe('getActivePool', () => {
    const showcase = { games: ['g1', 'g2', 'g3', 'g4', 'g5'] };
    const channels = [
        { id: 'ch-1', name: 'RPG', gameIds: ['g1', 'g3'] },
        { id: 'ch-2', name: 'Chill', gameIds: ['g2', 'g4'] },
    ];

    it('returns channel games when activeChannelId is set', () => {
        const pool = getActivePool(showcase, channels, 'ch-1');
        expect(pool).toEqual(['g1', 'g3']);
    });

    it('returns entire showcase when activeChannelId is null', () => {
        const pool = getActivePool(showcase, channels, null);
        expect(pool).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
    });

    it('returns entire showcase when activeChannelId is undefined', () => {
        const pool = getActivePool(showcase, channels, undefined);
        expect(pool).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
    });

    it('falls back to showcase when channel not found', () => {
        const pool = getActivePool(showcase, channels, 'nonexistent');
        expect(pool).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
    });

    it('falls back to showcase when channel is empty', () => {
        const emptyChannels = [{ id: 'ch-e', name: 'Empty', gameIds: [] }];
        const pool = getActivePool(showcase, emptyChannels, 'ch-e');
        expect(pool).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
    });

    it('filters out games no longer in showcase', () => {
        const smallShowcase = { games: ['g1', 'g3'] };
        // ch-2 has g2, g4 but they are not in showcase
        const pool = getActivePool(smallShowcase, channels, 'ch-2');
        // g2 and g4 not in showcase → filtered out → empty → fallback
        expect(pool).toEqual(['g1', 'g3']);
    });

    it('returns only showcase-valid games from channel', () => {
        // ch-1 has g1, g3 — both in showcase
        const partialShowcase = { games: ['g1', 'g2'] };
        const pool = getActivePool(partialShowcase, channels, 'ch-1');
        // g3 not in showcase, only g1 remains
        expect(pool).toEqual(['g1']);
    });

    it('handles null channels array', () => {
        const pool = getActivePool(showcase, null, 'ch-1');
        expect(pool).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
    });
});

describe('renameChannel', () => {
    it('renames a channel', () => {
        const ch = { id: 'ch-1', name: 'Old', gameIds: ['g1'] };
        const result = renameChannel(ch, 'New Name');
        expect(result.name).toBe('New Name');
        expect(result.gameIds).toEqual(['g1']); // preserved
    });

    it('trims whitespace', () => {
        const ch = { id: 'ch-1', name: 'Old', gameIds: [] };
        expect(renameChannel(ch, '  Trimmed  ').name).toBe('Trimmed');
    });

    it('returns unchanged for empty name', () => {
        const ch = { id: 'ch-1', name: 'Keep', gameIds: [] };
        expect(renameChannel(ch, '').name).toBe('Keep');
        expect(renameChannel(ch, '   ').name).toBe('Keep');
    });

    it('returns unchanged for null/undefined', () => {
        const ch = { id: 'ch-1', name: 'Keep', gameIds: [] };
        expect(renameChannel(ch, null)).toBe(ch);
        expect(renameChannel(ch, undefined)).toBe(ch);
    });
});

describe('MAX_CHANNELS', () => {
    it('is 2', () => {
        expect(MAX_CHANNELS).toBe(2);
    });
});
