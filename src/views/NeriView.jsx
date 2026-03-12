import { useState, useEffect, useCallback } from 'react';
import FaceSwitchButton from '../ui/FaceSwitchButton';
import ShowcaseList from '../ui/features/Neri/ShowcaseList';
import ShowcaseEmpty from '../ui/features/Neri/ShowcaseEmpty';
import NeriSearch from '../ui/features/Neri/NeriSearch';
import ExploreView from '../ui/features/Neri/ExploreView';
import { useGameInput } from '../hooks/useGameInput';
import { addToShowcase, removeFromShowcase, markCompleted } from '../core/showcase';
import bridge from '../services/bridge';
import './NeriView.css';

/**
 * Neri (練) — slow curation face.
 * Showcase view + search + explore entry.
 */
export default function NeriView({ onSwitchToAida }) {
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

    useGameInput({
        onBack: exploring ? () => setExploring(false) : onSwitchToAida,
    });

    if (loading) {
        return (
            <div className="neri-view">
                <div className="neri-content">
                    <p className="neri-loading">Loading...</p>
                </div>
            </div>
        );
    }

    if (exploring) {
        return (
            <div className="neri-view">
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
        <div className="neri-view">
            <div className="neri-content">
                <NeriSearch
                    showcaseIds={showcaseState.games}
                    onAdd={handleAdd}
                />

                {showcaseGames.length > 0 ? (
                    <>
                        <ShowcaseList
                            games={showcaseGames}
                            onRemove={handleRemove}
                            onComplete={handleComplete}
                        />
                        <button
                            type="button"
                            className="neri-explore-btn"
                            onClick={() => setExploring(true)}
                        >
                            explore more
                        </button>
                    </>
                ) : (
                    <ShowcaseEmpty onExplore={() => setExploring(true)} />
                )}
            </div>
            <FaceSwitchButton direction="to-aida" onClick={onSwitchToAida} />
        </div>
    );
}
