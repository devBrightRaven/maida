import { useState, useCallback, useRef } from 'react';
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
    expandedId,
    onExpandToggle,
}) {
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const renameCancelledRef = useRef(false);

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
        if (expandedId === kataId) onExpandToggle(null);
    }, [katas, activeKataId, expandedId, onUpdate]);

    const handleSetActive = useCallback((kataId) => {
        onUpdate({
            katas,
            activeKataId: kataId,
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
        <section className="kata-panel">
            <header className="kata-panel-header">
                <div>
                    <h2 className="kata-panel-title">{t('ui.katas.title')}</h2>
                    <p className="kata-panel-hint">{t('ui.katas.hint')}</p>
                    <p className="kata-panel-hint kata-panel-controls">{t('ui.katas.controls_hint')}</p>
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
            </header>

            {creating && (
                <div
                    className="kata-create-form"
                    onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                            setCreating(false);
                            setNewName('');
                        }
                    }}
                >
                    <input
                        type="text"
                        className="kata-create-input"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreate();
                            if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                        }}
                        placeholder={t('ui.katas.create_placeholder')}
                        maxLength={30}
                        autoFocus
                    />
                    <button type="button" className="kata-create-confirm" onClick={handleCreate}>+</button>
                    <button type="button" className="kata-create-cancel" onClick={() => { setCreating(false); setNewName(''); }}>×</button>
                </div>
            )}

            {katas.map(ch => {
                const isEditing = editingId === ch.id;
                const isActive = activeKataId === ch.id;
                return (
                    <div
                        key={ch.id}
                        className={`kata-group ${isActive ? 'kata-group--active' : ''} ${ch.gameIds.length === 0 ? 'kata-group--empty' : ''}`}
                        tabIndex={0}
                        role="group"
                        aria-label={ch.name}
                        onKeyDown={(e) => { if (e.key === 'F2') { e.preventDefault(); handleStartRename(ch); } }}
                        onClick={(e) => {
                            if (isEditing) return;
                            if (e.target.closest('button') || e.target.closest('input')) return;
                            if (ch.gameIds.length > 0) handleSetActive(ch.id);
                        }}
                    >
                        <button
                            type="button"
                            className="kata-select-btn"
                            aria-label={t(isActive ? 'ui.katas.select_aria_active' : 'ui.katas.select_aria', { name: ch.name, count: ch.gameIds.length })}
                            onClick={() => ch.gameIds.length > 0 && handleSetActive(ch.id)}
                            onDoubleClick={() => handleStartRename(ch)}
                        >
                            {isEditing ? (
                                <input
                                    type="text"
                                    className="kata-rename-input"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onBlur={() => {
                                        if (!renameCancelledRef.current) handleCommitRename();
                                        renameCancelledRef.current = false;
                                    }}
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter') {
                                            const btn = e.target.closest('.kata-select-btn');
                                            handleCommitRename();
                                            requestAnimationFrame(() => btn?.focus());
                                        }
                                        if (e.key === 'Escape') {
                                            renameCancelledRef.current = true;
                                            const btn = e.target.closest('.kata-select-btn');
                                            setEditingId(null);
                                            requestAnimationFrame(() => btn?.focus());
                                        }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    maxLength={30}
                                    autoFocus
                                />
                            ) : (
                                <span className="kata-item-name">
                                    {ch.name}
                                    <span className="kata-item-count">({ch.gameIds.length})</span>
                                </span>
                            )}
                        </button>
                        <span className={`kata-item-badge ${isActive ? '' : 'kata-item-badge--hidden'}`} aria-hidden="true">{t('ui.katas.active')}</span>
                        <button
                            type="button"
                            className="kata-expand-btn"
                            onClick={() => onExpandToggle(expandedId === ch.id ? null : ch.id)}
                            aria-label={t('ui.katas.edit_games_aria', { name: ch.name })}
                            aria-expanded={expandedId === ch.id}
                        >
                            {expandedId === ch.id ? '−' : '+'}
                        </button>
                        <button
                            type="button"
                            className={`kata-delete-btn ${confirmDeleteId === ch.id ? 'kata-delete-btn--confirm' : ''}`}
                            onClick={() => {
                                if (confirmDeleteId === ch.id) {
                                    handleDelete(ch.id);
                                    setConfirmDeleteId(null);
                                } else {
                                    setConfirmDeleteId(ch.id);
                                }
                            }}
                            onBlur={() => setConfirmDeleteId(null)}
                            aria-label={confirmDeleteId === ch.id ? t('ui.katas.confirm_delete_aria', { name: ch.name }) : t('ui.katas.delete_aria', { name: ch.name })}
                        >
                            {confirmDeleteId === ch.id ? '?' : '×'}
                        </button>

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
                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.click(); } }}
                                                aria-label={game.title}
                                            />
                                            <span aria-hidden="true">{game.title}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </section>
    );
}
