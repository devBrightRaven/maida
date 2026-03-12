import { describe, it, expect } from 'vitest';
import { deduplicateGames } from '../../core/dedup.js';

describe('deduplicateGames', () => {
  it('removes duplicates by steamAppId', () => {
    const games = [
      { id: '1', name: 'Elden Ring', steamAppId: '1245620', platform: 'steam' },
      { id: '2', name: 'Elden Ring', steamAppId: '1245620', platform: 'steam' }
    ];
    expect(deduplicateGames(games)).toHaveLength(1);
  });

  it('keeps first occurrence when deduplicating by steamAppId', () => {
    const games = [
      { id: '1', name: 'Elden Ring', steamAppId: '1245620', platform: 'steam' },
      { id: '2', name: 'Elden Ring', steamAppId: '1245620', platform: 'steam' }
    ];
    expect(deduplicateGames(games)[0].id).toBe('1');
  });

  it('removes duplicates by normalized name when no steamAppId', () => {
    const games = [
      { id: '1', name: 'Hades', steamAppId: null, platform: 'epic' },
      { id: '2', name: 'hades', steamAppId: null, platform: 'epic' }
    ];
    expect(deduplicateGames(games)).toHaveLength(1);
  });

  it('keeps distinct games', () => {
    const games = [
      { id: '1', name: 'Elden Ring', steamAppId: '1245620', platform: 'steam' },
      { id: '2', name: 'Hades', steamAppId: '1145360', platform: 'steam' }
    ];
    expect(deduplicateGames(games)).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateGames([])).toEqual([]);
  });
});
