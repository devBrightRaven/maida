import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import FaceSwitchButton from '../ui/FaceSwitchButton';
import ShowcaseList from '../ui/features/Kamae/ShowcaseList';
import KamaeSearch from '../ui/features/Kamae/KamaeSearch';
import ExploreView from '../ui/features/Kamae/ExploreView';
import SettingsPanel from '../ui/features/Kamae/SettingsPanel';
import KataPanel from '../ui/features/Kamae/KataPanel';
import { useGameInput } from '../hooks/useGameInput';
import { addGameToKata, removeGameFromKata } from '../core/katas';
import { t } from '../i18n';
import bridge from '../services/bridge';
import CalligraphyBg from '../ui/CalligraphyBg';
import './KamaeView.css';

/**
 * Kamae (構) — slow curation face.
 * Kata selector + game list + search + explore entry.
 */
export default function KamaeView({ onSwitchToRin }) {
    const [showcaseState, setShowcaseState] = useState({ games: [] });
    const [allInstalledGames, setAllInstalledGames] = useState([]);
    const [gameMap, setGameMap] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [exploring, setExploring] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Load showcase + all installed games on mount
    useEffect(() => {
        (async () => {
            const [data, gamesData] = await Promise.all([
                bridge.getShowcase(),
                bridge.getData('games'),
            ]);
            const state = data || { games: [] };
            setShowcaseState(state);

            if (gamesData?.games) {
                const installed = gamesData.games.filter(g => g.installed);
                setAllInstalledGames(installed);
                const map = new Map();
                installed.forEach(g => {
                    map.set(g.id, g);
                    if (g.steamAppId) map.set(g.steamAppId, g);
                });
                setGameMap(map);
            }

            setLoading(false);
        })();
    }, []);

    const activeKataId = showcaseState.activeKataId || null;
    const activeKata = useMemo(() => {
        if (!activeKataId) return null;
        return (showcaseState.katas || []).find(k => k.id === activeKataId) || null;
    }, [activeKataId, showcaseState.katas]);

    const displayedGames = useMemo(() => {
        if (!activeKata) return allInstalledGames;
        return activeKata.gameIds.map(id => gameMap.get(id)).filter(Boolean);
    }, [activeKata, allInstalledGames, gameMap]);

    const activeKataGameIds = useMemo(() => {
        if (!activeKata) return null;
        return activeKata.gameIds;
    }, [activeKata]);

    const persistShowcase = useCallback(async (nextState) => {
        setShowcaseState(nextState);
        await bridge.saveShowcase(nextState);
    }, []);

    const handleAdd = useCallback(async (gameId) => {
        if (!activeKataId || !activeKata) return;
        const updated = addGameToKata(activeKata, gameId);
        if (updated === activeKata) return;
        const nextKatas = (showcaseState.katas || []).map(k =>
            k.id === activeKataId ? updated : k
        );
        await persistShowcase({ ...showcaseState, katas: nextKatas });
    }, [activeKataId, activeKata, showcaseState, persistShowcase]);

    const handleRemove = useCallback(async (gameId) => {
        if (!activeKataId || !activeKata) return;
        const updated = removeGameFromKata(activeKata, gameId);
        if (updated === activeKata) return;
        const nextKatas = (showcaseState.katas || []).map(k =>
            k.id === activeKataId ? updated : k
        );
        await persistShowcase({ ...showcaseState, katas: nextKatas });
    }, [activeKataId, activeKata, showcaseState, persistShowcase]);

    const handleKataUpdate = useCallback(async ({ katas, activeKataId: newActiveId }) => {
        const next = { ...showcaseState, katas, activeKataId: newActiveId };
        setShowcaseState(next);
        await bridge.saveShowcase(next);
    }, [showcaseState]);

    const containerRef = useRef(null);

    // D-pad navigation: cycle through all interactive elements
    const handleNav = useCallback((dir) => {
        const container = containerRef.current;
        if (!container) return;
        const focusable = Array.from(container.querySelectorAll(
            'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"]), [role="button"], label.kata-game-toggle'
        ));
        if (focusable.length === 0) return;
        const current = focusable.indexOf(document.activeElement);
        let next;
        if (dir === 'down' || dir === 'right') {
            next = current < focusable.length - 1 ? current + 1 : 0;
        } else {
            next = current > 0 ? current - 1 : focusable.length - 1;
        }
        focusable[next]?.focus();
    }, []);

    // A button: activate focused element (button click or checkbox toggle)
    const handleMainAction = useCallback(() => {
        const el = document.activeElement;
        if (!el) return;
        if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
            el.click();
        } else if (el.tagName === 'INPUT') {
            el.click();
        } else if (el.tagName === 'LABEL') {
            // Click the checkbox inside the label
            const cb = el.querySelector('input[type="checkbox"]');
            if (cb) cb.click();
        }
    }, []);

    useGameInput({
        onBack: exploring ? () => setExploring(false) : undefined,
        onNav: handleNav,
        onMainAction: handleMainAction,
        onMainAction: handleMainAction,
    });

    if (loading) {
        return (
            <main className="kamae-view" ref={containerRef}>
                <div className="kamae-content">
                    <p className="kamae-loading">{t('ui.status.loading')}</p>
                </div>
            </main>
        );
    }

    if (showSettings) {
        return (
            <main className="kamae-view" ref={containerRef}>
                <div className="kamae-content">
                    <SettingsPanel onClose={() => setShowSettings(false)} />
                </div>
            </main>
        );
    }

    if (exploring) {
        return (
            <main className="kamae-view kamae-view--explore" ref={containerRef}>
                <ExploreView
                    allInstalledGames={allInstalledGames}
                    katas={showcaseState.katas || []}
                    onAddToKata={handleAdd}
                    onBack={() => setExploring(false)}
                    exploreHistory={showcaseState.exploreHistory}
                    onExploreHistoryUpdate={async (history) => {
                        const next = { ...showcaseState, exploreHistory: history };
                        setShowcaseState(next);
                        await bridge.saveShowcase(next);
                    }}
                />
            </main>
        );
    }

    return (
        <main className="kamae-view" ref={containerRef}>
            <CalligraphyBg char="構" className="kamae-calligraphy-bg" />
            <div className="kamae-title-block" role="img" aria-label={t('ui.kamae.reading')}>
                <p className="kamae-title-reading">{t('ui.kamae.reading')}</p>
                <p className="kamae-title-desc">{t('ui.kamae.desc')}</p>
            </div>
            <div className="kamae-content">
                <button
                    type="button"
                    className={`kata-item ${activeKataId === null ? 'kata-item--active' : ''}`}
                    onClick={() => handleKataUpdate({ katas: showcaseState.katas || [], activeKataId: null })}
                >
                    <span className="kata-item-name">{t('ui.katas.all_games')}</span>
                    <span className="kata-item-actions kata-item-actions--placeholder" />
                    <span className={`kata-item-badge ${activeKataId === null ? '' : 'kata-item-badge--hidden'}`}>{t('ui.katas.active')}</span>
                </button>
                <KataPanel
                    katas={showcaseState.katas || []}
                    activeKataId={activeKataId}
                    showcaseGames={allInstalledGames}
                    onUpdate={handleKataUpdate}
                />
                <KamaeSearch
                    activeKataGameIds={activeKataGameIds}
                    onAdd={handleAdd}
                />
                <ShowcaseList
                    games={displayedGames}
                    onRemove={handleRemove}
                    isKataMode={activeKata !== null}
                />
                {/* Explore hidden for v0.1.0 — kata search replaces it */}
                {false && activeKataId && (
                    <button
                        type="button"
                        className="kamae-explore-btn"
                        onClick={() => setExploring(true)}
                    >
                        {t('ui.kamae.explore_more')}
                    </button>
                )}
                <button
                    type="button"
                    className="kamae-settings-link"
                    onClick={() => setShowSettings(true)}
                >
                    {t('ui.settings.title').toLowerCase()}
                </button>
            </div>
            <FaceSwitchButton direction="to-rin" onClick={onSwitchToRin} />
        </main>
    );
}
