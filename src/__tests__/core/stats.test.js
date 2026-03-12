import { describe, it, expect } from 'vitest';
import { computeStats } from '../../core/stats.js';

describe('computeStats', () => {
  it('computes total hours (rounded to 1 decimal)', () => {
    const games = [
      { id: '1', name: 'A', totalTime: 9360, lastPlayed: null },
      { id: '2', name: 'B', totalTime: 1800, lastPlayed: null },
      { id: '3', name: 'C', totalTime: 720, lastPlayed: null },
    ];
    // (9360 + 1800 + 720) / 3600 = 3.3
    expect(computeStats(games).totalHours).toBe(3.3);
  });

  it('returns recentlyExplored when enough games have dates', () => {
    // 3 out of 3 have dates → reliable (>= 3 threshold)
    const games = [
      { id: '1', name: 'Elden Ring', totalTime: 0, lastPlayed: '2026-03-01T00:00:00Z' },
      { id: '2', name: 'Hades', totalTime: 0, lastPlayed: '2026-02-15T00:00:00Z' },
      { id: '3', name: 'Abzu', totalTime: 0, lastPlayed: '2026-01-01T00:00:00Z' },
    ];
    expect(computeStats(games).recentlyExplored).toBe('Elden Ring');
  });

  it('returns null when too few games have dates (unreliable data)', () => {
    // 2 out of 100 have dates → unreliable
    const games = Array.from({ length: 100 }, (_, i) => ({
      id: String(i), name: `Game ${i}`, totalTime: 0, lastPlayed: null,
    }));
    games[0].lastPlayed = '2026-03-01T00:00:00Z';
    games[1].lastPlayed = '2026-02-01T00:00:00Z';
    expect(computeStats(games).recentlyExplored).toBeNull();
  });

  it('returns null for recentlyExplored when no lastPlayed at all', () => {
    const games = [{ id: '1', name: 'X', totalTime: 0, lastPlayed: null }];
    expect(computeStats(games).recentlyExplored).toBeNull();
  });

  it('handles empty array', () => {
    const result = computeStats([]);
    expect(result.totalHours).toBe(0);
    expect(result.recentlyExplored).toBeNull();
  });
});
