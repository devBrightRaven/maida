import { describe, it, expect } from 'vitest';
import { filterByPlatform, ALL_PLATFORMS } from '../../core/filter.js';

const GAMES = [
  { id: '1', name: 'A', platform: 'steam' },
  { id: '2', name: 'B', platform: 'gog' },
  { id: '3', name: 'C', platform: 'epic' },
  { id: '4', name: 'D', platform: 'other' },
  { id: '5', name: 'E', platform: 'steam' },
];

describe('ALL_PLATFORMS', () => {
  it('exports four platforms', () => {
    expect(ALL_PLATFORMS).toEqual(['steam', 'gog', 'epic', 'other']);
  });
});

describe('filterByPlatform', () => {
  it('returns all games when all platforms selected', () => {
    expect(filterByPlatform(GAMES, new Set(ALL_PLATFORMS))).toEqual(GAMES);
  });

  it('returns all games when selectedPlatforms is empty (no filter)', () => {
    expect(filterByPlatform(GAMES, new Set())).toEqual(GAMES);
  });

  it('filters to single platform', () => {
    const result = filterByPlatform(GAMES, new Set(['steam']));
    expect(result).toHaveLength(2);
    expect(result.every(g => g.platform === 'steam')).toBe(true);
  });

  it('filters to multiple platforms', () => {
    const result = filterByPlatform(GAMES, new Set(['gog', 'epic']));
    expect(result).toHaveLength(2);
  });

  it('returns empty when no games match selected platform', () => {
    const result = filterByPlatform(GAMES, new Set(['battlenet']));
    expect(result).toEqual([]);
  });
});
