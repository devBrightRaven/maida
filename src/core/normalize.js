const PLUGIN_IDS = {
  'cb91dfc9-b977-43bf-8e70-55f46e410fab': 'steam',
  'aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e': 'gog',
  '00000002-dbd1-46c6-b5d0-b1ba559d10e4': 'epic'
};

export function detectPlatform(pluginId) {
  return PLUGIN_IDS[pluginId] ?? 'other';
}

export function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

function steamCoverUrl(appId) {
  if (!appId) return null;
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

export function normalizePlayniteGame(raw) {
  if (!raw || typeof raw.Name !== 'string' || raw.Name.trim() === '') return null;

  const platform = detectPlatform(raw.PluginId);
  const steamAppId = platform === 'steam' ? (raw.GameId ?? null) : null;

  return {
    id: raw.Id ?? crypto.randomUUID(),
    name: raw.Name.trim(),
    platform,
    steamAppId,
    totalTime: raw.Playtime ?? 0,
    lastPlayed: raw.LastActivity ?? null,
    isInstalled: raw.IsInstalled ?? false,
    importedAt: new Date().toISOString(),
    description: stripHtml(raw.Description),
    coverUrl: steamCoverUrl(steamAppId),
    developers: (raw.Developers ?? []).map(d => d.Name),
    genres: (raw.Genres ?? []).map(g => g.Name),
    releaseYear: raw.ReleaseYear ?? null,
    links: (raw.Links ?? []).map(l => ({ name: l.Name, url: l.Url })),
  };
}
