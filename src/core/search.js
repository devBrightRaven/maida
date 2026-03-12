export function searchGames(games, query) {
  const trimmed = query.trim();
  if (trimmed === '') return games;

  const lower = trimmed.toLowerCase();
  return games.filter(game =>
    game.name.toLowerCase().includes(lower)
  );
}
