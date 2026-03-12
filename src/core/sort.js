export const SORT_KEYS = ['recentlyPlayed', 'name', 'totalTime'];

const comparators = {
  name: (a, b) => a.name.localeCompare(b.name),

  totalTime: (a, b) => b.totalTime - a.totalTime,

  recentlyPlayed: (a, b) => {
    if (!a.lastPlayed && !b.lastPlayed) return 0;
    if (!a.lastPlayed) return 1;
    if (!b.lastPlayed) return -1;
    return new Date(b.lastPlayed) - new Date(a.lastPlayed);
  },
};

export function sortGames(games, key) {
  const compare = comparators[key] ?? comparators.recentlyPlayed;
  return [...games].sort(compare);
}
