import { useState, useEffect, useCallback, useRef } from 'react';
import FaceSwitchButton from '../ui/FaceSwitchButton';
import ShowcaseList from '../ui/features/Kamae/ShowcaseList';
import ShowcaseEmpty from '../ui/features/Kamae/ShowcaseEmpty';
import KamaeSearch from '../ui/features/Kamae/KamaeSearch';
import ExploreView from '../ui/features/Kamae/ExploreView';
import { useGameInput } from '../hooks/useGameInput';
import { addToShowcase, removeFromShowcase, markCompleted } from '../core/showcase';
import { t } from '../i18n';
import bridge from '../services/bridge';
import './KamaeView.css';

/**
 * Kamae (構) — slow curation face.
 * Showcase view + search + explore entry.
 */
export default function KamaeView({ onSwitchToRin }) {
    const [showcaseState, setShowcaseState] = useState({ games: [] });
    const [showcaseGames, setShowcaseGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exploring, setExploring] = useState(false);
    const [autoExploreChecked, setAutoExploreChecked] = useState(false);

    // Load showcase on mount
    useEffect(() => {
        (async () => {
            const data = await bridge.getShowcase();
            const state = data || { games: [] };
            setShowcaseState(state);
            setLoading(false);
            // Auto-enter explore if showcase is empty
            if (state.games.length === 0) {
                setExploring(true);
            }
            setAutoExploreChecked(true);
        })();
    }, []);

    // Resolve showcase IDs to full game objects
    useEffect(() => {
        if (showcaseState.games.length === 0) {
            setShowcaseGames([]);
            return;
        }
        (async () => {
            const gamesData = await bridge.getData('games');
            if (!gamesData?.games) return;
            const gameMap = new Map();
            gamesData.games.forEach(g => {
                gameMap.set(g.id, g);
                gameMap.set(g.steamAppId, g);
            });
            const resolved = showcaseState.games
                .map(id => gameMap.get(id))
                .filter(Boolean);
            setShowcaseGames(resolved);
        })();
    }, [showcaseState.games]);

    const persistShowcase = useCallback(async (nextState) => {
        setShowcaseState(nextState);
        await bridge.saveShowcase(nextState);
    }, []);

    const handleAdd = useCallback(async (gameId) => {
        const next = addToShowcase(showcaseState, gameId);
        if (next !== showcaseState) await persistShowcase(next);
    }, [showcaseState, persistShowcase]);

    const handleRemove = useCallback(async (gameId) => {
        const next = removeFromShowcase(showcaseState, gameId);
        await persistShowcase(next);
    }, [showcaseState, persistShowcase]);

    const handleComplete = useCallback(async (gameId) => {
        const next = markCompleted(showcaseState, gameId);
        await persistShowcase(next);
    }, [showcaseState, persistShowcase]);

    const containerRef = useRef(null);

    // D-pad navigation: cycle through buttons only (skip inputs to avoid virtual keyboard)
    const handleNav = useCallback((dir) => {
        const container = containerRef.current;
        if (!container) return;
        const focusable = Array.from(container.querySelectorAll(
            'button:not(:disabled), [tabindex]:not([tabindex="-1"])'
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

    // A button: click focused element
    const handleMainAction = useCallback(() => {
        const el = document.activeElement;
        if (el && el.tagName === 'BUTTON') el.click();
    }, []);

    useGameInput({
        onBack: exploring ? () => setExploring(false) : undefined,
        onNav: handleNav,
        onMainAction: handleMainAction,
    });

    if (loading) {
        return (
            <div className="kamae-view" ref={containerRef}>
                <div className="kamae-content">
                    <p className="kamae-loading">Loading...</p>
                </div>
            </div>
        );
    }

    if (exploring) {
        return (
            <div className="kamae-view" ref={containerRef}>
                <ExploreView
                    showcaseState={showcaseState}
                    onAdd={handleAdd}
                    onBack={() => setExploring(false)}
                    onShowcaseUpdate={setShowcaseState}
                />
            </div>
        );
    }

    return (
        <div className="kamae-view" ref={containerRef}>
            <div className="kamae-title-block" aria-hidden="true">
                <p className="kamae-title-kanji">構</p>
                <p className="kamae-title-reading">{t('ui.kamae.reading')}</p>
                <p className="kamae-title-desc">{t('ui.kamae.desc')}</p>
            </div>
            <div className="kamae-content">
                <KamaeSearch
                    showcaseIds={showcaseState.games}
                    onAdd={handleAdd}
                />

                {showcaseGames.length > 0 ? (
                    <>
                        <ShowcaseList
                            games={showcaseGames}
                            onRemove={handleRemove}
                        />
                        <button
                            type="button"
                            className="kamae-explore-btn"
                            onClick={() => setExploring(true)}
                        >
                            explore more
                        </button>
                    </>
                ) : (
                    <ShowcaseEmpty onExplore={() => setExploring(true)} />
                )}
            </div>
            <FaceSwitchButton direction="to-rin" onClick={onSwitchToRin} />
        </div>
    );
}
