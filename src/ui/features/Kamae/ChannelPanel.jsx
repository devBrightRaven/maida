import { useState, useCallback } from 'react';
import { t } from '../../../i18n';
import {
    createChannel,
    deleteChannel,
    addGameToChannel,
    removeGameFromChannel,
    MAX_CHANNELS,
} from '../../../core/channels';

/**
 * ChannelPanel — manage mood-period game groupings.
 * Visible when licensed, disabled (with message) when not.
 */
export default function ChannelPanel({
    channels,
    activeChannelId,
    showcaseGames,
    licensed,
    onUpdate,
}) {
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [expandedId, setExpandedId] = useState(null);

    // Locked state — show but disable
    if (!licensed) {
        return (
            <div className="channel-panel channel-panel--locked">
                <h3 className="channel-panel-title">{t('ui.channels.locked_title')}</h3>
                <p className="channel-panel-locked-desc">{t('ui.channels.locked_desc')}</p>
            </div>
        );
    }

    const handleCreate = useCallback(() => {
        const ch = createChannel(newName);
        if (!ch) return;
        onUpdate({
            channels: [...channels, ch],
            activeChannelId,
        });
        setNewName('');
        setCreating(false);
    }, [newName, channels, activeChannelId, onUpdate]);

    const handleDelete = useCallback((channelId) => {
        const next = deleteChannel(channels, channelId);
        onUpdate({
            channels: next,
            activeChannelId: activeChannelId === channelId ? null : activeChannelId,
        });
        if (expandedId === channelId) setExpandedId(null);
    }, [channels, activeChannelId, expandedId, onUpdate]);

    const handleSetActive = useCallback((channelId) => {
        onUpdate({
            channels,
            activeChannelId: activeChannelId === channelId ? null : channelId,
        });
    }, [channels, activeChannelId, onUpdate]);

    const handleToggleGame = useCallback((channelId, gameId) => {
        const ch = channels.find(c => c.id === channelId);
        if (!ch) return;
        const updated = ch.gameIds.includes(gameId)
            ? removeGameFromChannel(ch, gameId)
            : addGameToChannel(ch, gameId);
        const nextChannels = channels.map(c => c.id === channelId ? updated : c);
        onUpdate({ channels: nextChannels, activeChannelId });
    }, [channels, activeChannelId, onUpdate]);

    return (
        <div className="channel-panel">
            <div className="channel-panel-header">
                <div>
                    <h3 className="channel-panel-title">{t('ui.channels.title')}</h3>
                    <p className="channel-panel-hint">{t('ui.channels.hint')}</p>
                </div>
                {channels.length < MAX_CHANNELS && !creating && (
                    <button
                        type="button"
                        className="channel-create-btn"
                        onClick={() => setCreating(true)}
                    >
                        {t('ui.channels.create')}
                    </button>
                )}
            </div>

            {creating && (
                <div className="channel-create-form">
                    <input
                        type="text"
                        className="channel-create-input"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        placeholder={t('ui.channels.create_placeholder')}
                        maxLength={30}
                        autoFocus
                    />
                    <button type="button" className="channel-create-confirm" onClick={handleCreate}>+</button>
                    <button type="button" className="channel-create-cancel" onClick={() => { setCreating(false); setNewName(''); }}>×</button>
                </div>
            )}

            {/* "All games" option */}
            <button
                type="button"
                className={`channel-item ${activeChannelId === null ? 'channel-item--active' : ''}`}
                onClick={() => onUpdate({ channels, activeChannelId: null })}
            >
                <span className="channel-item-name">{t('ui.channels.all_games')}</span>
                {activeChannelId === null && <span className="channel-item-badge">{t('ui.channels.active')}</span>}
            </button>

            {channels.map(ch => (
                <div key={ch.id} className="channel-group">
                    <button
                        type="button"
                        className={`channel-item ${activeChannelId === ch.id ? 'channel-item--active' : ''}`}
                        onClick={() => handleSetActive(ch.id)}
                    >
                        <span className="channel-item-name">
                            {ch.name}
                            <span className="channel-item-count">({ch.gameIds.length})</span>
                        </span>
                        {activeChannelId === ch.id && <span className="channel-item-badge">{t('ui.channels.active')}</span>}
                    </button>

                    <div className="channel-item-actions">
                        <button
                            type="button"
                            className="channel-expand-btn"
                            onClick={() => setExpandedId(expandedId === ch.id ? null : ch.id)}
                            aria-label="Edit channel games"
                        >
                            {expandedId === ch.id ? '−' : '+'}
                        </button>
                        <button
                            type="button"
                            className="channel-delete-btn"
                            onClick={() => handleDelete(ch.id)}
                            aria-label="Delete channel"
                        >
                            ×
                        </button>
                    </div>

                    {expandedId === ch.id && (
                        <div className="channel-game-list">
                            {showcaseGames.length === 0 && (
                                <p className="channel-empty">{t('ui.channels.empty')}</p>
                            )}
                            {showcaseGames.map(game => {
                                const gameId = game.id || game.steamAppId;
                                const inChannel = ch.gameIds.includes(gameId);
                                return (
                                    <label key={gameId} className="channel-game-toggle">
                                        <input
                                            type="checkbox"
                                            checked={inChannel}
                                            onChange={() => handleToggleGame(ch.id, gameId)}
                                        />
                                        <span>{game.title}</span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
