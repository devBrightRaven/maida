export const MAX_CHANNELS = 5;

export function createChannel(name) {
    if (!name || typeof name !== 'string') return null;
    const trimmed = name.trim();
    if (trimmed.length === 0) return null;
    return { id: crypto.randomUUID(), name: trimmed, gameIds: [] };
}

export function deleteChannel(channels, channelId) {
    return channels.filter(ch => ch.id !== channelId);
}

export function addGameToChannel(channel, gameId) {
    if (!channel || !gameId) return channel;
    if (channel.gameIds.includes(gameId)) return channel;
    return { ...channel, gameIds: [...channel.gameIds, gameId] };
}

export function removeGameFromChannel(channel, gameId) {
    if (!channel || !gameId) return channel;
    return { ...channel, gameIds: channel.gameIds.filter(id => id !== gameId) };
}

/**
 * Get the game IDs that Rin's dice should roll from.
 * If activeChannelId is set and the channel has games, use that channel.
 * Otherwise fall back to the entire showcase.
 */
export function getActivePool(showcase, channels, activeChannelId) {
    if (!activeChannelId) return showcase.games;
    const channel = (channels || []).find(ch => ch.id === activeChannelId);
    if (!channel || channel.gameIds.length === 0) return showcase.games;
    // Only include games that are still in the showcase
    const showcaseSet = new Set(showcase.games);
    const filtered = channel.gameIds.filter(id => showcaseSet.has(id));
    return filtered.length > 0 ? filtered : showcase.games;
}

export function renameChannel(channel, newName) {
    if (!channel || !newName || typeof newName !== 'string') return channel;
    const trimmed = newName.trim();
    if (trimmed.length === 0) return channel;
    return { ...channel, name: trimmed };
}
