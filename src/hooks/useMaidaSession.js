import { useState, useEffect } from 'react';
import { getActiveGame, getPrescription } from '../core/engine';
import { applyConstraints } from '../core/constraints';
import { applyTryScore, applySkipScore, updateGameScore, mergePenalties, removeFromSkipSets, mergeExcludeAppId, isFirstRun, resetAllScores } from '../core/session-logic';
import { debugStore } from '../core/debugStore';
import { loadData, saveData } from '../services/persistence';
import bridge from '../services/bridge';
import { loadShowcase } from '../services/persistence';

export function useMaidaSession() {
    const [data, setData] = useState({ games: null, prescriptions: null });
    const [session, setSession] = useState({ game: null, prescription: null });
    const [status, setStatus] = useState('loading'); // 'loading' | 'onboarding' | 'active' | 'frozen'

    // BEHAVIORAL STATE (v2.3)
    const [sessionSkippedSet, setSessionSkippedSet] = useState([]);
    const [sessionSkippedHistory, setSessionSkippedHistory] = useState([]);
    const [returnPenaltySet, setReturnPenaltySet] = useState([]);

    // HISTORY & ANCHOR
    const [history, setHistory] = useState(null);
    const [isAnchored, setIsAnchored] = useState(false);

    // CONSTRAINTS (friction elimination)
    const [constraints, setConstraints] = useState(null);

    // SHOWCASE (Kamae curation — candidatePool for engine)
    const [showcaseIds, setShowcaseIds] = useState(null); // null = not loaded yet, [] = empty

    const init = async () => {
        const [games, prescriptions, anchorData, returnPenalties, constraintsData, showcaseData] = await Promise.all([
            loadData('games'),
            loadData('prescriptions'),
            loadData('anchor'),
            loadData('returnPenalties'),
            loadData('constraints'),
            loadShowcase()
        ]);

        if (constraintsData) setConstraints(constraintsData);

        // Load showcase IDs for candidatePool (kata-aware)
        const activeKataId = showcaseData?.activeKataId || null;
        const katas = showcaseData?.katas || [];
        const activeKata = activeKataId ? katas.find(k => k.id === activeKataId) : null;
        const kataPool = activeKata?.gameIds?.length > 0 ? activeKata.gameIds : null;
        setShowcaseIds(kataPool);

        const firstRun = isFirstRun(games);

        if (firstRun) {
            const steamCheck = await bridge.checkSteamAvailable();
            if (!steamCheck.available) {
                setStatus('error');
                return;
            }

            setStatus('onboarding');
            setData({ games, prescriptions });
            return;
        }

        // Fire-and-forget: scan Steam ACF files in background, don't block startup.
        // Local games.json is sufficient for first render; snapshot updates arrive later.
        bridge.performBackgroundSnapshot().then(async (result) => {
            if (result && result.success) {
                const freshGames = await loadData('games');
                setData(prev => ({ ...prev, games: freshGames }));
            }
        }).catch(() => {});
        const freshGames = games;

        setData({ games: freshGames, prescriptions });
        if (returnPenalties) setReturnPenaltySet(returnPenalties);

        // Restore anchor state if present
        if (anchorData && anchorData.isAnchored && anchorData.gameId) {
            const anchoredGame = freshGames.games.find(g => g.id === anchorData.gameId);
            if (anchoredGame) {
                const prescription = getPrescription(anchoredGame, prescriptions);
                setSession({ game: anchoredGame, prescription });
                setIsAnchored(true);
                setStatus('active');
                return;
            }
            await saveData('anchor', null);
        }

        // Normal flow if no anchor
        const constrainedGames = kataPool
            ? freshGames  // Showcase mode: skip constraints, candidatePool handles filtering
            : applyConstraints(freshGames, constraintsData);
        const game = getActiveGame(constrainedGames, {
            sessionSkippedSet: [],
            returnPenaltySet: returnPenalties || [],
            candidatePool: kataPool || undefined
        });
        const prescription = getPrescription(game, prescriptions);

        setSession({ game, prescription });
        setStatus('active');
    };

    useEffect(() => {
        init();
    }, []);

    const refreshSession = (options = {}) => {
        const {
            resetSkip = false,
            overrideSkipped = null,
            overridePenalties = null,
            overrideData = null,
            preventHistory = false
        } = options;

        const currentSkipped = resetSkip ? [] : (overrideSkipped || sessionSkippedSet || []);
        const currentPenalties = overridePenalties || returnPenaltySet;
        if (resetSkip) {
            setSessionSkippedSet([]);
            setSessionSkippedHistory([]);
        }

        const gamesSource = overrideData || data.games;
        const constrainedGames = showcaseIds
            ? gamesSource  // Showcase mode: skip constraints
            : applyConstraints(gamesSource, constraints);

        let nextGame = getActiveGame(constrainedGames, {
            sessionSkippedSet: currentSkipped,
            returnPenaltySet: currentPenalties,
            candidatePool: showcaseIds || undefined
        });

        // SOFT RESET (Exhausted pool fallback)
        if (!nextGame && currentSkipped.length > 0) {
            setSessionSkippedSet([]);
            setSessionSkippedHistory([]);
            nextGame = getActiveGame(constrainedGames, {
                sessionSkippedSet: [],
                returnPenaltySet: currentPenalties,
                candidatePool: showcaseIds || undefined
            });
        }

        const prescription = getPrescription(nextGame, data.prescriptions);

        if (!preventHistory) {
            setHistory(session);
        }
        setSession({ game: nextGame, prescription });
        setStatus('active');
    };

    // Reset all behavioral state (used by Debug Panel)
    const resetAll = async () => {
        // Reset all scores to 0
        const nextData = { ...data.games, games: resetAllScores(data.games.games) };

        // Clear all behavioral state
        setSessionSkippedSet([]);
        setSessionSkippedHistory([]);
        setReturnPenaltySet([]);

        // Persist changes
        await saveData('games', nextData);
        await saveData('returnPenalties', []);

        // Update local state
        setData(prev => ({ ...prev, games: nextData }));

        // Force new roll to refresh trace and UI with CLEARED penalties
        console.log('[Maida] All behavioral state reset.');
    };

    // CONSTRAINTS: Hide game permanently (Debug Panel only)
    const hideGame = async (steamAppId) => {
        const updated = mergeExcludeAppId(constraints, steamAppId);
        setConstraints(updated);
        await saveData('constraints', updated);
        debugStore.log('HIDE', { steamAppId });
        refreshSession({ resetSkip: false });
    };

    const handleAction = async (type, options = {}) => {
        // Allow 'skip' or 'back' even if no game (e.g. Acknowledge button in idle state)
        if (!session.game && type !== 'back' && type !== 'skip') return;

        if (type === 'visit') {
            // Check if this is PLAY (anchored) or TRY (not anchored)
            if (isAnchored) {
                // PLAY: Launch anchored game (no weight change, no behavioral signal)
                debugStore.log('PLAY', { gameId: session.game.id, title: session.game.title });
                console.log('[Maida PLAY] options:', options, 'steamUrl:', session.game.steamUrl);

                if (!options.silent && session.game.steamUrl) {
                    bridge.launchGame(session.game.steamUrl);
                }

                // Transition to freeze state (shows "MAIDA IS PAUSED" screen)
                setStatus('frozen');

                // Stay in freeze state, no memory changes
                return;
            }

            // TRY: Commitment under uncertainty (weight +1.0)
            const oldScore = session.game.score || 0;
            const newScore = applyTryScore(oldScore);
            debugStore.log('TRY', { gameId: session.game.id, title: session.game.title, change: `${oldScore.toFixed(2)} -> ${newScore.toFixed(2)}` });
            const updatedGames = updateGameScore(data.games.games, session.game.id, applyTryScore);

            const nextData = { ...data.games, games: updatedGames };
            await saveData('games', nextData);
            setData(prev => ({ ...prev, games: nextData }));

            if (!options.silent && session.game.steamUrl) {
                bridge.launchGame(session.game.steamUrl);
            }

            // SYSTEM EVENT: COMMITMENT
            // 1. Clear session hard-exclusion
            setSessionSkippedSet([]);

            // 2. Generate new returnPenaltySet (MERGE LOGIC)
            // Core Principle: TRY can only ADD scars, never remove them (unless replaced by new ones)
            const finalPenalties = mergePenalties(returnPenaltySet, sessionSkippedHistory);

            if (sessionSkippedHistory.length > 0) {
                debugStore.log('PENALTY_UPDATE', { previous: returnPenaltySet, new: finalPenalties });
                setReturnPenaltySet(finalPenalties);
                await saveData('returnPenalties', finalPenalties);
            }

            // 3. Clear session skip history
            setSessionSkippedHistory([]);

            // 4. Force session refresh to clear exclusions in trace
            refreshSession({
                resetSkip: true,
                overridePenalties: finalPenalties,
                overrideData: nextData
            });

            setStatus('frozen');
            setHistory(null);

        } else if (type === 'skip') {
            // Guard: idle state (no game) — just refresh, don't crash
            if (!session.game) {
                refreshSession({ resetSkip: true });
                return;
            }
            // BEHAVIORAL SIGNAL: NOT NOW (-2.0)
            if (sessionSkippedSet.includes(session.game.id)) return;

            const currentId = session.game.id;
            const updatedSkipped = [...sessionSkippedSet, currentId];
            const updatedHistory = [...sessionSkippedHistory, currentId];

            setSessionSkippedSet(updatedSkipped);
            setSessionSkippedHistory(updatedHistory);

            const oldScore = session.game.score || 0;
            const newSkipScore = applySkipScore(oldScore);
            debugStore.log('NOT_NOW', { gameId: currentId, title: session.game.title, change: `${oldScore.toFixed(2)} -> ${newSkipScore.toFixed(2)}` });
            const updatedGames = updateGameScore(data.games.games, currentId, applySkipScore);

            const nextData = { ...data.games, games: updatedGames };
            await saveData('games', nextData);
            setData(prev => ({ ...prev, games: nextData }));

            refreshSession({
                resetSkip: false,
                overrideSkipped: updatedSkipped,
                overrideData: nextData
            });
        } else if (type === 'back') {
            if (history && history.game) {
                const prev = history;
                const restoredId = prev.game.id;

                setHistory(null);

                // CRITICAL FIX: Update exclusion sets first
                const { skippedSet: nextSkipped, skippedHistory: nextHistory } = removeFromSkipSets(sessionSkippedSet, sessionSkippedHistory, restoredId);

                setSessionSkippedSet(nextSkipped);
                setSessionSkippedHistory(nextHistory);

                // Use refreshSession to safely restore state and update trace
                refreshSession({
                    resetSkip: false,
                    overrideSkipped: nextSkipped,
                    preventHistory: true
                });

                // Manual override after refresh to ensure we get exactly the previous game
                // AND that the trace reflects it correctly.
                // Actually, engine.updateDebugTrace needs to be called.

                // Better approach: just manually set it all, but call updateTrace if we could.
                // Since updateTrace is internal to engine/App, let's trust that the next render cycle 
                // in App.jsx (which calls updateTraceOnly on props change or similar) might catch it?
                // No, App.jsx only calls updateTraceOnly on simulation actions. 

                // Let's use the standard setSession but ensure exclusion is gone.
                setSession(prev);

                debugStore.log('UNDO', { gameId: restoredId, title: prev.game.title });
            }
        } else if (type === 'anchor') {
            const anchorPayload = {
                isAnchored: true,
                gameId: session.game.id
            };
            console.log('[Maida] Anchor action triggered, saving:', anchorPayload);
            setIsAnchored(true);
            // Persist anchor state
            await saveData('anchor', anchorPayload);
            console.log('[Maida] Anchor data saved successfully');
            debugStore.log('ANCHOR', { gameId: session.game.id, title: session.game.title });
        } else if (type === 'release') {
            setIsAnchored(false);
            setHistory(null);
            // Clear persisted anchor
            await saveData('anchor', null);
            debugStore.log('CLEAR', { gameId: session.game.id, title: session.game.title });
        }
    };

    // Reload showcase and re-roll (called when switching back from Kamae)
    const reloadShowcase = async () => {
        const showcaseData = await loadShowcase();
        const activeKataId = showcaseData?.activeKataId || null;
        const katas = showcaseData?.katas || [];
        const activeKata = activeKataId ? katas.find(k => k.id === activeKataId) : null;
        const newIds = activeKata?.gameIds?.length > 0 ? activeKata.gameIds : null;
        setShowcaseIds(newIds);
        // Re-roll with updated pool
        const gamesSource = data.games;
        if (!gamesSource) return;
        const constrainedGames = newIds ? gamesSource : applyConstraints(gamesSource, constraints);
        const game = getActiveGame(constrainedGames, {
            sessionSkippedSet: [],
            returnPenaltySet,
            candidatePool: newIds || undefined
        });
        const prescription = getPrescription(game, data.prescriptions);
        setSessionSkippedSet([]);
        setSessionSkippedHistory([]);
        setSession({ game, prescription });
    };

    return {
        data,
        session,
        status,
        sessionSkippedSet,
        returnPenaltySet,
        isAnchored,
        showcaseIds,
        setData,
        setStatus,
        setSessionSkippedSet,
        init,
        refreshSession,
        handleAction,
        canUndo: !!history,
        resetAll,
        constraints,
        hideGame,
        reloadShowcase
    };
}
