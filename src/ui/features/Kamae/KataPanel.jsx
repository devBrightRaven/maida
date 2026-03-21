import { useState, useCallback } from 'react';
import { t } from '../../../i18n';
import {
    createKata,
    deleteKata,
    addGameToKata,
    removeGameFromKata,
    renameKata,
    MAX_KATAS,
} from '../../../core/katas';

/**
 * KataPanel — manage mood-period game groupings.
 * Visible when licensed, disabled (with message) when not.
 */
export default function KataPanel({
    katas,
    activeKataId,
    showcaseGames,
    onUpdate,
}) {
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);

    const handleCreate = useCallback(() => {
        const ch = createKata(newName);
        if (!ch) return;
        onUpdate({
            katas: [...katas, ch],
            activeKataId,
        });
        setNewName('');
        setCreating(false);
    }, [newName, katas, activeKataId, onUpdate]);

    const handleDelete = useCallback((kataId) => {
        const next = deleteKata(katas, kataId);
        onUpdate({
            katas: next,
            activeKataId: activeKataId === kataId ? null : activeKataId,
        });
        if (expandedId === kataId) setExpandedId(null);
    }, [katas, activeKataId, expandedId, onUpdate]);

    const handleSetActive = useCallback((kataId) => {
        onUpdate({
            katas,
            activeKataId: activeKataId === kataId ? null : kataId,
        });
    }, [katas, activeKataId, onUpdate]);

    const handleToggleGame = useCallback((kataId, gameId) => {
        const ch = katas.find(c => c.id === kataId);
        if (!ch) return;
        const updated = ch.gameIds.includes(gameId)
            ? removeGameFromKata(ch, gameId)
            : addGameToKata(ch, gameId);
        const nextKatas = katas.map(c => c.id === kataId ? updated : c);
        onUpdate({ katas: nextKatas, activeKataId });
    }, [katas, activeKataId, onUpdate]);

    const handleStartRename = useCallback((ch) => {
        setEditingId(ch.id);
        setEditName(ch.name);
    }, []);

    const handleCommitRename = useCallback(() => {
        if (!editingId) return;
        const trimmed = editName.trim();
        if (trimmed.length === 0) {
            setEditingId(null);
            return;
        }
        const ch = katas.find(c => c.id === editingId);
        if (!ch) { setEditingId(null); return; }
        const updated = renameKata(ch, trimmed);
        const nextKatas = katas.map(c => c.id === editingId ? updated : c);
        onUpdate({ katas: nextKatas, activeKataId });
        setEditingId(null);
    }, [editingId, editName, katas, activeKataId, onUpdate]);

    return (
        <div className="kata-panel">
            <div className="kata-panel-header">
                <div>
                    <h3 className="kata-panel-title">{t('ui.katas.title')}</h3>
                    <p className="kata-panel-hint">{t('ui.katas.hint')}</p>
                </div>
                {katas.length < MAX_KATAS && !creating && (
                    <button
                        type="button"
                        className="kata-create-btn"
                        onClick={() => setCreating(true)}
                    >
                        {t('ui.katas.create')}
                    </button>
                )}
            </div>

            {creating && (
                <div className="kata-create-form">
                    <input
                        type="text"
                        className="kata-create-input"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        placeholder={t('ui.katas.create_placeholder')}
                        maxLength={30}
                        autoFocus
                    />
                    <button type="button" className="kata-create-confirm" onClick={handleCreate}>+</button>
                    <button type="button" className="kata-create-cancel" onClick={() => { setCreating(false); setNewName(''); }}>×</button>
                </div>
            )}

            {katas.map(ch => (
                <div
                    key={ch.id}
                    className={`kata-group ${activeKataId === ch.id ? 'kata-group--active' : ''} ${ch.gameIds.length === 0 ? 'kata-group--empty' : ''}`}
                    onClick={() => ch.gameIds.length > 0 && handleSetActive(ch.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ch.gameIds.length > 0 && handleSetActive(ch.id); } }}
                    aria-label={`Select ${ch.name}`}
                >
                    <span className="kata-select-btn">
                        <span className="kata-item-name">
                            {editingId === ch.id ? (
                                <input
                                    type="text"
                                    className="kata-rename-input"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onBlur={handleCommitRename}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCommitRename();
                                        if (e.key === 'Escape') setEditingId(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    maxLength={30}
                                    autoFocus
                                />
                            ) : (
                                <span onDoubleClick={(e) => { e.stopPropagation(); handleStartRename(ch); }}>
                                    {ch.name}
                                </span>
                            )}
                            <span className="kata-item-count">({ch.gameIds.length})</span>
                        </span>
                    </span>
                    <div className="kata-item-actions">
                        <button
                            type="button"
                            className="kata-expand-btn"
                            onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === ch.id ? null : ch.id); }}
                            aria-label={`Edit ${ch.name} games`}
                        >
                            {expandedId === ch.id ? '−' : '+'}
                        </button>
                        <button
                            type="button"
                            className={`kata-delete-btn ${confirmDeleteId === ch.id ? 'kata-delete-btn--confirm' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirmDeleteId === ch.id) {
                                    handleDelete(ch.id);
                                    setConfirmDeleteId(null);
                                } else {
                                    setConfirmDeleteId(ch.id);
                                }
                            }}
                            onBlur={() => setConfirmDeleteId(null)}
                            aria-label={confirmDeleteId === ch.id ? `Confirm delete ${ch.name}` : `Delete ${ch.name}`}
                        >
                            {confirmDeleteId === ch.id ? '?' : '×'}
                        </button>
                    </div>
                    <span className={`kata-item-badge ${activeKataId === ch.id ? '' : 'kata-item-badge--hidden'}`}>{t('ui.katas.active')}</span>

                    {expandedId === ch.id && (
                        <div className="kata-game-list">
                            {showcaseGames.length === 0 && (
                                <p className="kata-empty">{t('ui.katas.empty')}</p>
                            )}
                            {showcaseGames.map(game => {
                                const gameId = game.id || game.steamAppId;
                                const inKata = ch.gameIds.includes(gameId);
                                return (
                                    <label key={gameId} className="kata-game-toggle">
                                        <input
                                            type="checkbox"
                                            checked={inKata}
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
