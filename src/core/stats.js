export function computeStats(games) {
  const totalSeconds = games.reduce((sum, g) => sum + (g.totalTime ?? 0), 0);
  const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;

  // Only show "recently explored" if enough games have play dates
  // (Playnite offline data often lacks this — future Steam API will provide it)
  const withDates = games.filter(g => g.lastPlayed);
  let recentlyExplored = null;
  const hasReliableData = withDates.length >= Math.max(3, games.length * 0.1);
  if (hasReliableData) {
    const sorted = [...withDates].sort(
      (a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed),
    );
    recentlyExplored = sorted[0].name;
  }

  return { totalHours, recentlyExplored };
}
