import React, { useState, useEffect, useRef, useCallback } from 'react';
import RinView from './views/RinView';
import KamaeView from './views/KamaeView';
import OnboardingView from './views/OnboardingView';
import FaceSwitchButton from './ui/FaceSwitchButton';
import { calculateTraceWeights, updateDebugTrace } from './core/engine';
import { useMaidaSession } from './hooks/useMaidaSession';
import { useUpdateCheck } from './hooks/useUpdateCheck';
import { useTheme } from './hooks/useTheme';
import { useGameInput } from './hooks/useGameInput';
import bridge from './services/bridge';

import { Agentation } from 'agentation';
import { t } from './i18n';
import { loadPrescriptionTranslations } from './i18n/prescriptions';
import './App.css';

// Load prescription translations for detected locale (fire-and-forget)
loadPrescriptionTranslations();

// Frozen state screen with gamepad support
// Input guard: cooldown on mount to prevent accidental double-tap from TRY
function FrozenScreen({ onResume, guardMs = 5000 }) {
    const btnRef = useRef(null);
    const [ready, setReady] = useState(false);

    // Input guard: delay before accepting input
    useEffect(() => {
        const timer = setTimeout(() => {
            setReady(true);
            btnRef.current?.focus();
        }, guardMs);
        return () => clearTimeout(timer);
    }, [guardMs]);

    // Auto-focus on window refocus (only after guard)
    useEffect(() => {
        if (!ready) return;
        const handleWindowFocus = () => btnRef.current?.focus();
        window.addEventListener('focus', handleWindowFocus);
        return () => window.removeEventListener('focus', handleWindowFocus);
    }, [ready]);

    const guardedResume = () => { if (ready) onResume(); };

    // Gamepad support (A = resume, D-pad grabs focus)
    useGameInput({
        onMainAction: guardedResume,
        onBack: guardedResume, // B also resumes
        onNav: () => ready && btnRef.current?.focus(),
        disabled: !ready
    });

    return (
        <main className="void-screen">
            <p className="frozen-message">{t('ui.status.frozen')}</p>
            <button
                ref={btnRef}
                className="restart-selection-btn"
                aria-label={t('ui.button.im_back')}
                onClick={guardedResume}
                disabled={!ready}
            >
                {t('ui.button.im_back')}
            </button>
        </main>
    );
}

function App() {
    const {
        data,
        session,
        status,
        sessionSkippedSet,
        returnPenaltySet,
        setData,
        setStatus,
        init,
        refreshSession,
        handleAction,
        canUndo,
        setSessionSkippedSet,
        isAnchored,
        resetAll,
        hideGame,
        reloadShowcase,
        showcaseIds
    } = useMaidaSession();

    const updateCheck = useUpdateCheck();
    const { theme, toggleTheme } = useTheme();

    // Face switching (Rin ↔ Kamae)
    const [face, setFace] = useState('rin');
    const switchToKamae = useCallback(() => setFace('kamae'), []);
    const switchToRin = useCallback(() => {
        setFace('rin');
        reloadShowcase(); // Re-roll with updated showcase
    }, [reloadShowcase]);
    const toggleFace = useCallback(() => setFace(f => f === 'rin' ? 'kamae' : 'rin'), []);

    // L1/R1 gamepad face switching
    useGameInput({
        onL1: switchToRin,
        onR1: switchToKamae,
    });

    // Ctrl+Tab keyboard shortcut (undocumented)
    useEffect(() => {
        const handler = (e) => {
            if (e.ctrlKey && e.key === 'Tab') {
                e.preventDefault();
                toggleFace();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [toggleFace]);

    const [debugMode, setDebugMode] = useState(false);
    const [silentMode, setSilentMode] = useState(false);
    const [tapCount, setTapCount] = useState({ count: 0, lastTap: 0 });
    const [temperature, setTemperature] = useState(0.6);
    const [decayRate, setDecayRate] = useState(20);
    // Input UX Thresholds (ms)
    const [tapThreshold, setTapThreshold] = useState(300);
    const [anchorThreshold, setAnchorThreshold] = useState(3000);
    const [resumeGuard, setResumeGuard] = useState(5000);

    const themeToggle = (
        <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('ui.button.theme_light') : t('ui.button.theme_dark')}
            title={theme === 'dark' ? t('ui.button.theme_light') : t('ui.button.theme_dark')}
        >
            {theme === 'dark' ? '\u2600' : '\u263D'}
        </button>
    );

    const updateTraceOnly = (currentGames, currentTemp) => {
        const calc = calculateTraceWeights(currentGames, {
            sessionSkippedSet,
            returnPenaltySet,
            temperature: currentTemp
        });
        if (calc) {
            updateDebugTrace(
                calc.traceCandidates,
                session.game,
                currentTemp,
                calc.traceCandidates.length
            );
        }
    };

    const handleSimulation = async (action, payload) => {
        if (action === 'setTemp') {
            setTemperature(payload);
            updateTraceOnly(data.games, payload);
            return;
        }

        if (action === 'setDecay') {
            setDecayRate(payload);
            return;
        }

        if (action === 'setTapThreshold') {
            setTapThreshold(payload);
            return;
        }

        if (action === 'setAnchorThreshold') {
            setAnchorThreshold(payload);
            return;
        }

        if (action === 'setResumeGuard') {
            setResumeGuard(payload);
            return;
        }

        let updatedGamesList = data.games.games;
        if (action === 'simPlay' || action === 'simSkip') {
            updatedGamesList = updatedGamesList.map(g => {
                if (g.id === session.game?.id) {
                    const oldScore = g.score || 0;
                    let newScore = oldScore;
                    if (action === 'simPlay') newScore = Math.min(3, oldScore + 1); // TRY
                    if (action === 'simSkip') newScore = Math.max(-3, oldScore - 2); // NOT NOW
                    return { ...g, score: newScore };
                }
                return g;
            });
        }

        if (action === 'simDecay') {
            const factor = 1 - (decayRate / 100);
            updatedGamesList = updatedGamesList.map(g => ({
                ...g,
                score: (g.score || 0) * factor
            }));
        }

        if (action === 'simReset') {
            await resetAll();
            // Manually update trace to reflect cleared state WITHOUT rolling a new game
            const resetGamesList = data.games.games.map(g => ({ ...g, score: 0 }));
            const nextData = { ...data.games, games: resetGamesList };

            // Explicitly calculate trace with empty penalties to avoid stale state race condition
            const calc = calculateTraceWeights(nextData, {
                sessionSkippedSet: [],
                returnPenaltySet: [], // Explicitly empty
                temperature: temperature
            });

            if (calc) {
                updateDebugTrace(
                    calc.traceCandidates,
                    session.game,
                    temperature,
                    calc.traceCandidates.length
                );
            }
            return;
        }

        const nextData = { ...data.games, games: updatedGamesList };
        setData(prev => ({ ...prev, games: nextData }));
        updateTraceOnly(nextData, temperature);
    };

    const handleSecretTap = () => {
        // Build-time flag to permanently disable debug panel
        if (import.meta.env.VITE_DISABLE_DEBUG === 'true') return;

        const now = Date.now();
        if (now - tapCount.lastTap < 2000) {
            const newCount = tapCount.count + 1;
            if (newCount >= 7) {
                setDebugMode(prev => !prev);
                console.log('[Maida] Debug mode toggled via 7-tap');
                setTapCount({ count: 0, lastTap: 0 });
            } else {
                setTapCount({ count: newCount, lastTap: now });
            }
        } else {
            setTapCount({ count: 1, lastTap: now });
        }
    };

    const [showLoadingText, setShowLoadingText] = useState(false);

    useEffect(() => {
        if (status === 'loading') {
            const timer = setTimeout(() => setShowLoadingText(true), 200);
            return () => clearTimeout(timer);
        } else {
            setShowLoadingText(false);
        }
    }, [status]);

    if (status === 'loading') return (
        <>
            {themeToggle}
            <div className="app-loading">
                {showLoadingText && (
                    <>
                        <span className="dot"></span>
                        <p>
                            {t('ui.status.loading').split('\n').map((line, i) => (
                                <React.Fragment key={i}>
                                    {line}
                                    <br />
                                </React.Fragment>
                            ))}
                        </p>
                    </>
                )}
            </div>
        </>
    );

    if (status === 'error') return (
        <div className="void-screen">
            {themeToggle}
            <p className="frozen-message">
                {t('voice.error.steam_not_found')}
            </p>
            <button
                className="restart-selection-btn"
                onClick={() => init()}
            >
                {t('ui.button.sync')}
            </button>
        </div>
    );

    if (status === 'onboarding') return (
        <>
            {themeToggle}
            <OnboardingView onComplete={init} />
        </>
    );

    if (status === 'frozen') {
        return (
            <>
                {themeToggle}
                <FrozenScreen onResume={() => setStatus('active')} guardMs={resumeGuard} />
            </>
        );
    }

    if (face === 'kamae') {
        return (
            <div className="app-root">
                {themeToggle}
                <KamaeView onSwitchToRin={switchToRin} />
                {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
            </div>
        );
    }

    return (
        <div className="app-root">
            {themeToggle}
            <RinView
                game={session.game}
                prescription={session.prescription}
                onAction={(type) => handleAction(type, { silent: silentMode })}
                debugMode={debugMode}
                silentMode={silentMode}
                setSilentMode={setSilentMode}
                onSecretTap={handleSecretTap}
                temperature={temperature}
                decayRate={decayRate}
                onSimulation={handleSimulation}
                canUndo={canUndo}
                isAnchored={isAnchored}
                returnPenaltySet={returnPenaltySet}
                tapThreshold={tapThreshold}
                anchorThreshold={anchorThreshold}
                resumeGuard={resumeGuard}
                onHideGame={hideGame}
                onSwitchToKamae={switchToKamae}
            />
            <div className="global-version-tag" role="contentinfo">
                <span className="version-name">Maida マイダ</span>
                <span className="version-number">
                    v{__APP_VERSION__}
                    {updateCheck.isUpdateAvailable && ` → ${updateCheck.latestVersion}`}
                </span>
                {updateCheck.isUpdateAvailable && (
                    <button
                        className="version-link"
                        onClick={updateCheck.installUpdate}
                        disabled={updateCheck.updating}
                        aria-label={`Update to ${updateCheck.latestVersion}`}
                    >
                        {updateCheck.updating ? 'Updating...' : 'Update'}
                    </button>
                )}
            </div>
            {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
        </div>
    );
}

export default App;
