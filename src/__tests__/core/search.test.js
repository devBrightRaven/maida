import { describe, it, expect } from 'vitest';
import { searchGames } from '../../core/search.js';

const GAMES = [
  { id: '1', name: 'Elden Ring', platform: 'steam' },
  { id: '2', name: 'Sekiro: Shadows Die Twice', platform: 'steam' },
  { id: '3', name: 'Hades', platform: 'epic' },
  { id: '4', name: 'Black Myth: Wukong', platform: 'steam' },
];

describe('searchGames', () => {
  it('returns all games when query is empty', () => {
    expect(searchGames(GAMES, '')).toEqual(GAMES);
  });

  it('returns all games when query is whitespace', () => {
    expect(searchGames(GAMES, '   ')).toEqual(GAMES);
  });

  it('filters by name (case-insensitive)', () => {
    const result = searchGames(GAMES, 'elden');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Elden Ring');
  });

  it('matches partial names', () => {
    const result = searchGames(GAMES, 'myth');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Black Myth: Wukong');
  });

  it('returns empty array when nothing matches', () => {
    expect(searchGames(GAMES, 'zelda')).toEqual([]);
  });

  it('handles special regex characters safely', () => {
    expect(() => searchGames(GAMES, 'shadows (die')).not.toThrow();
  });
});
