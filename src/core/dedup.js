export function deduplicateGames(games) {
  const seenAppIds = new Set();
  const seenNames = new Set();
  const result = [];

  for (const game of games) {
    if (game.steamAppId) {
      if (seenAppIds.has(game.steamAppId)) continue;
      seenAppIds.add(game.steamAppId);
    } else {
      const key = game.name.toLowerCase().trim();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
    }
    result.push(game);
  }

  return result;
}
