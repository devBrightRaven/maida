import { useState, useEffect, useCallback, useRef } from 'react';
import { t } from '../../../i18n';
import ExploreCard from './ExploreCard';
import ExploreLimitReached from './ExploreLimitReached';
import { canExploreMore, recordCardShown, resetDailyExplore, DAILY_EXPLORE_LIMIT } from '../../../core/explore';
import { addToBox } from '../../../core/box';
import { useGameInput } from '../../../hooks/useGameInput';
import bridge from '../../../services/bridge';

/**
 * ExploreView — card-by-card warehouse discovery.
 * Fetches one random game at a time, tracks daily limit.
 */
export default function ExploreView({ showcaseState, onAdd, onBack, onShowcaseUpdate }) {
    const [currentGame, setCurrentGame] = useState(null);
    const [exploreState, setExploreState] = useState(
        showcaseState.exploreHistory || { lastSessionDate: null, cardsShownToday: 0 }
    );
    const [exhausted, setExhausted] = useState(false);
    const sessionShownRef = useRef(new Set());

    const todayDate = new Date().toISOString().slice(0, 10);

    // Reset daily counter if new day (synchronous, before first render decision)
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const reset = resetDailyExplore(exploreState, todayDate);
        if (reset !== exploreState) {
            setExploreState(reset);
        }
        setReady(true);
    }, []);

    const fetchNextCard = useCallback(async () => {
        // Build exclusion list: showcase + active box + already shown this session
        const excludeIds = [
            ...showcaseState.games,
            ...(showcaseState.box || []).map(e => e.gameId || e),
            ...sessionShownRef.current,
        ];

        const game = await bridge.sampleWarehouse(excludeIds);
        if (!game) {
            setExhausted(true);
            setCurrentGame(null);
            return;
        }

        const gameId = game.id || game.steamAppId;
        sessionShownRef.current.add(gameId);
        setCurrentGame(game);
    }, [showcaseState.games, showcaseState.box]);

    // Fetch first card after reset is applied
    useEffect(() => {
        if (ready && canExploreMore(exploreState) && !exhausted) {
            fetchNextCard();
        }
    }, [ready]);

    const advanceCard = useCallback(async (updatedExplore) => {
        setExploreState(updatedExplore);
        // Persist explore history
        const nextShowcase = { ...showcaseState, exploreHistory: updatedExplore };
        await bridge.saveShowcase(nextShowcase);

        if (canExploreMore(updatedExplore)) {
            await fetchNextCard();
        }
    }, [showcaseState, fetchNextCard]);

    const handleAdd = useCallback(async () => {
        if (!currentGame) return;
        const gameId = currentGame.id || currentGame.steamAppId;
        onAdd(gameId);
        const nextExplore = recordCardShown(exploreState);
        await advanceCard(nextExplore);
    }, [currentGame, exploreState, onAdd, advanceCard]);

    const handleDismiss = useCallback(async () => {
        if (!currentGame) return;
        const gameId = currentGame.id || currentGame.steamAppId;
        const now = new Date().toISOString();

        // Add to box
        const currentBox = showcaseState.box || { entries: [] };
        const nextBox = addToBox(
            Array.isArray(currentBox) ? { entries: currentBox } : currentBox,
            gameId,
            now
        );
        const nextShowcase = { ...showcaseState, box: nextBox.entries };
        onShowcaseUpdate(nextShowcase);

        const nextExplore = recordCardShown(exploreState);
        await advanceCard(nextExplore);
    }, [currentGame, showcaseState, exploreState, onShowcaseUpdate, advanceCard]);

    // Gamepad: D-pad Right = add, D-pad Left = dismiss, B = back
    useGameInput({
        onNav: (dir) => {
            if (dir === 'right') handleAdd();
            if (dir === 'left') handleDismiss();
        },
        onMainAction: handleAdd,
        onBack: onBack,
    });

    if (!canExploreMore(exploreState)) {
        return <ExploreLimitReached onBack={onBack} />;
    }

    if (exhausted) {
        return (
            <div className="explore-exhausted">
                <p>{t('ui.explore.exhausted')}</p>
                <button type="button" className="explore-limit-btn" onClick={onBack}>
                    {t('ui.explore.limit_back')}
                </button>
            </div>
        );
    }

    return (
        <div className="explore-view">
            <div className="explore-header">
                <button
                    type="button"
                    className="explore-back-btn"
                    onClick={onBack}
                    aria-label="Return to showcase"
                >
                    {t('ui.explore.back')}
                </button>
                <span className="explore-counter">
                    {exploreState.cardsShownToday} / {DAILY_EXPLORE_LIMIT}
                </span>
            </div>
            <ExploreCard
                game={currentGame}
                onAdd={handleAdd}
                onDismiss={handleDismiss}
            />
        </div>
    );
}
