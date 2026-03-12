import { describe, it, expect } from 'vitest';
import { sortGames, SORT_KEYS } from '../../core/sort.js';

const GAMES = [
  { id: '1', name: 'Zelda', totalTime: 100, lastPlayed: '2026-01-01T00:00:00Z' },
  { id: '2', name: 'Elden Ring', totalTime: 9360, lastPlayed: '2026-03-01T00:00:00Z' },
  { id: '3', name: 'Hades', totalTime: 500, lastPlayed: null },
  { id: '4', name: 'Abzu', totalTime: 200, lastPlayed: '2025-12-15T00:00:00Z' },
];

describe('SORT_KEYS', () => {
  it('exports three sort keys', () => {
    expect(SORT_KEYS).toEqual(['recentlyPlayed', 'name', 'totalTime']);
  });
});

describe('sortGames', () => {
  it('sorts by name alphabetically', () => {
    const result = sortGames(GAMES, 'name');
    expect(result.map(g => g.name)).toEqual(['Abzu', 'Elden Ring', 'Hades', 'Zelda']);
  });

  it('sorts by totalTime descending', () => {
    const result = sortGames(GAMES, 'totalTime');
    expect(result.map(g => g.name)).toEqual(['Elden Ring', 'Hades', 'Abzu', 'Zelda']);
  });

  it('sorts by recentlyPlayed (newest first, null last)', () => {
    const result = sortGames(GAMES, 'recentlyPlayed');
    expect(result.map(g => g.name)).toEqual(['Elden Ring', 'Zelda', 'Abzu', 'Hades']);
  });

  it('returns a new array (no mutation)', () => {
    const result = sortGames(GAMES, 'name');
    expect(result).not.toBe(GAMES);
  });

  it('defaults to recentlyPlayed for unknown key', () => {
    const result = sortGames(GAMES, 'invalid');
    expect(result.map(g => g.name)).toEqual(['Elden Ring', 'Zelda', 'Abzu', 'Hades']);
  });
});
