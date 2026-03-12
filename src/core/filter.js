export const ALL_PLATFORMS = ['steam', 'gog', 'epic', 'other'];

export function filterByPlatform(games, selectedPlatforms) {
  if (selectedPlatforms.size === 0) return games;
  return games.filter(game => selectedPlatforms.has(game.platform));
}
