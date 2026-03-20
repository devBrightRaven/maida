import { useState, useEffect, useCallback, useRef } from 'react';
import { t } from '../../../i18n';
import ExploreCard from './ExploreCard';
import ExploreLimitReached from './ExploreLimitReached';
import { canExploreMore, recordCardShown, resetDailyExplore, DAILY_EXPLORE_LIMIT } from '../../../core/explore';
import { getUncategorizedGames } from '../../../core/katas';
import { useGameInput } from '../../../hooks/useGameInput';

/**
 * ExploreView — card-by-card discovery of uncategorized installed games.
 * Picks randomly from installed games not yet in any kata, tracks daily limit.
 */
export default function ExploreView({ allInstalledGames, katas, onAddToKata, onBack, exploreHistory, onExploreHistoryUpdate }) {
    const [currentGame, setCurrentGame] = useState(null);
    const [exploreState, setExploreState] = useState(
        exploreHistory || { lastSessionDate: null, cardsShownToday: 0 }
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

    const fetchNextCard = useCallback(() => {
        const uncategorized = getUncategorizedGames(allInstalledGames, katas);
        const unseen = uncategorized.filter(g => !sessionShownRef.current.has(g.id));
        if (unseen.length === 0) {
            setExhausted(true);
            setCurrentGame(null);
            return;
        }
        const pick = unseen[Math.floor(Math.random() * unseen.length)];
        sessionShownRef.current.add(pick.id);
        setCurrentGame(pick);
    }, [allInstalledGames, katas]);

    // Fetch first card after reset is applied
    useEffect(() => {
        if (ready && canExploreMore(exploreState) && !exhausted) {
            fetchNextCard();
        }
    }, [ready]);

    const advanceCard = useCallback((updatedExplore) => {
        setExploreState(updatedExplore);
        onExploreHistoryUpdate(updatedExplore);
        if (canExploreMore(updatedExplore)) {
            fetchNextCard();
        }
    }, [onExploreHistoryUpdate, fetchNextCard]);

    const handleAdd = useCallback(() => {
        if (!currentGame) return;
        const gameId = currentGame.id || currentGame.steamAppId;
        onAddToKata(gameId);
        const nextExplore = recordCardShown(exploreState);
        advanceCard(nextExplore);
    }, [currentGame, exploreState, onAddToKata, advanceCard]);

    const handleDismiss = useCallback(() => {
        const nextExplore = recordCardShown(exploreState);
        advanceCard(nextExplore);
    }, [exploreState, advanceCard]);

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
