import React, { useState, useEffect, useRef, useCallback } from 'react';
import RinView from './views/RinView';
import KamaeView from './views/KamaeView';
import OnboardingView from './views/OnboardingView';
import FaceSwitchButton from './ui/FaceSwitchButton';
import VersionTag from './ui/VersionTag';
import { calculateTraceWeights, updateDebugTrace } from './core/engine';
import { useMaidaSession } from './hooks/useMaidaSession';
import { useUpdateCheck } from './hooks/useUpdateCheck';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
import { STEP, TOUR_TOTAL } from './tourSteps';
import { useTheme } from './hooks/useTheme';
import { useGameInput } from './hooks/useGameInput';
import bridge from './services/bridge';

import { Agentation } from 'agentation';
import { t, getLocale } from './i18n';
import { loadPrescriptionTranslations } from './i18n/prescriptions';
import { secondsToWord } from './i18n/numbers';
import './App.css';

// Load prescription translations for detected locale (fire-and-forget)
loadPrescriptionTranslations();

// Frozen state screen with gamepad support
// Input guard: cooldown on mount to prevent accidental double-tap from TRY
function FrozenScreen({ onResume, guardMs = 5000 }) {
    const btnRef = useRef(null);
    const msgRef = useRef(null);
    const [ready, setReady] = useState(false);
    const totalSeconds = Math.ceil(guardMs / 1000);
    const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
    const [initialAnnounced, setInitialAnnounced] = useState(false);
    const prefersReducedMotion = usePrefersReducedMotion();

    // Focus frozen message immediately so SR reads it (not theme toggle)
    useEffect(() => {
        msgRef.current?.focus();
    }, []);

    // Delay the initial SR announce so it registers as a content
    // mutation on the aria-live region. Content present on first
    // render is typically not re-announced (SR already busy reading
    // the focused h1). 300ms lets the h1 announcement settle first
    // and ensures the live region's text transition is detected.
    useEffect(() => {
        const timer = setTimeout(() => setInitialAnnounced(true), 300);
        return () => clearTimeout(timer);
    }, []);

    // Per-second countdown: drives visual subtitle + transitions to
    // ready. Single source of truth for both visual countdown and SR
    // milestone announcements.
    useEffect(() => {
        if (secondsLeft <= 0) {
            setReady(true);
            btnRef.current?.focus();
            return;
        }
        const timer = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [secondsLeft]);

    // Auto-focus on window refocus (only after guard)
    useEffect(() => {
        if (!ready) return;
        const handleWindowFocus = () => btnRef.current?.focus();
        window.addEventListener('focus', handleWindowFocus);
        return () => window.removeEventListener('focus', handleWindowFocus);
    }, [ready]);

    const guardedResume = () => { if (ready) onResume(); };

    // Always listen (no disabled gate) so arrow / d-pad can cycle
    // focus between the resume button and the theme toggle even
    // during the guard period. guardedResume and the button's own
    // disabled attribute prevent premature resume.
    useGameInput({
        onMainAction: guardedResume,
        onBack: guardedResume,
        onNav: () => {
            const current = document.activeElement;
            const themeToggle = document.querySelector('.theme-toggle');
            if (current === themeToggle) {
                if (ready && btnRef.current) btnRef.current.focus();
            } else if (current === btnRef.current) {
                themeToggle?.focus();
            } else {
                if (ready && btnRef.current) btnRef.current.focus();
                else themeToggle?.focus();
            }
        }
    });

    return (
        <main className="void-screen">
            <h1 className="frozen-message" tabIndex={-1} ref={msgRef}>{t('ui.status.frozen')}</h1>
            <p className="frozen-subtitle">
                {ready
                    ? t('ui.status.frozen_ready')
                    : prefersReducedMotion
                        ? t('ui.status.frozen_wait_static', { seconds: totalSeconds })
                        : t('ui.status.frozen_wait', { seconds: secondsLeft })}
            </p>
            <button
                ref={btnRef}
                className="restart-selection-btn"
                aria-label={ready ? t('ui.button.im_back') : t('ui.button.im_back_wait')}
                onClick={guardedResume}
                disabled={!ready}
            >
                {t('ui.button.im_back')}
            </button>
            <p className="sr-only" role="status" aria-live={ready ? 'assertive' : 'polite'}>
                {ready
                    ? t('ui.status.frozen_ready')
                    : (initialAnnounced && secondsLeft === totalSeconds
                        ? t('ui.status.frozen_wait_sr', { seconds: secondsToWord(totalSeconds, getLocale()) })
                        : '')}
            </p>
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


    // Locale change: increment key to re-render entire tree without reload
    const [localeVersion, setLocaleVersion] = useState(0);
    const handleLocaleChange = useCallback(() => {
        loadPrescriptionTranslations();
        setLocaleVersion(v => v + 1);
    }, []);

    // Guided tour (spans Rin + Kamae)
    // null = off, number = global step index
    const [tourStep, setTourStep] = useState(null);
    const hasSeenTour = localStorage.getItem('maida-hasSeenTour') === 'true';

    const startTour = useCallback(() => setTourStep(0), []);
    const startKamaeTour = useCallback(() => setTourStep(STEP.KAMAE_KATA), []);
    const startFullTour = useCallback(() => {
        setFace('rin');
        setTourStep(0);
    }, []);
    const closeTour = useCallback(() => {
        setTourStep(null);
        localStorage.setItem('maida-hasSeenTour', 'true');
    }, []);
    const prevTour = useCallback(() => {
        setTourStep(s => {
            if (s === null || s <= 0) return s;
            // Don't go back across face boundaries (can't prev from Kamae's
            // first step into Rin's last step — they're different views)
            if (s === STEP.KAMAE_KATA) return s;
            return s - 1;
        });
    }, []);
    const advanceTour = useCallback(() => {
        setTourStep(s => {
            if (s === null) return null;
            if (s >= TOUR_TOTAL - 1) {
                localStorage.setItem('maida-hasSeenTour', 'true');
                return null;
            }
            return s + 1;
        });
    }, []);

    // Face switching (Rin ↔ Kamae)
    const [face, setFace] = useState('rin');
    const focusMain = useCallback(() => {
        requestAnimationFrame(() => {
            const main = document.querySelector('main');
            if (main) {
                main.setAttribute('tabindex', '-1');
                main.focus();
            }
        });
    }, []);
    const switchToKamae = useCallback(() => {
        setFace(prev => { if (prev === 'kamae') return prev; focusMain(); return 'kamae'; });
        // Tour step 4 = face switch to Kamae (interactive)
        if (tourStep === STEP.RIN_SWITCH_KAMAE) setTourStep(STEP.KAMAE_KATA);
    }, [focusMain, tourStep]);
    const switchToRin = useCallback(() => {
        setFace(prev => { if (prev === 'rin') return prev; reloadShowcase(); focusMain(); return 'rin'; });
        // Tour step 8 = face switch back to Rin (interactive) → tour ends
        if (tourStep === STEP.KAMAE_SWITCH_RIN) { setTourStep(null); localStorage.setItem('maida-hasSeenTour', 'true'); }
    }, [reloadShowcase, focusMain, tourStep]);
    const toggleFace = useCallback(() => setFace(f => f === 'rin' ? 'kamae' : 'rin'), []);

    // Open settings: from Rin → switch to Kamae settings, from Kamae → open settings panel
    const [settingsRequested, setSettingsRequested] = useState(false);
    const openSettings = useCallback(() => {
        if (face === 'rin') {
            setSettingsRequested(true);
            switchToKamae();
        } else {
            setSettingsRequested(true);
        }
    }, [face, switchToKamae]);

    // L1/R1 gamepad face switching + Menu button
    useGameInput({
        onL1: switchToRin,
        onR1: switchToKamae,
        onMenu: openSettings,
    });

    // Ctrl+Tab keyboard shortcut (undocumented)
    useEffect(() => {
        const handler = (e) => {
            if (e.ctrlKey && e.key === 'Tab') {
                e.preventDefault();
                toggleFace();
            }
            if (e.key === 'F10') {
                e.preventDefault();
                openSettings();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [toggleFace, openSettings]);

    const [updateAlertShown, setUpdateAlertShown] = useState(false);
    useEffect(() => {
        if (updateCheck.isUpdateAvailable && !updateAlertShown) {
            const timer = setTimeout(() => setUpdateAlertShown(true), 3000);
            return () => clearTimeout(timer);
        }
    }, [updateCheck.isUpdateAvailable, updateAlertShown]);
    const [debugMode, setDebugMode] = useState(false);
    const [silentMode, setSilentMode] = useState(false);
    const [tapCount, setTapCount] = useState({ count: 0, lastTap: 0 });
    const [temperature, setTemperature] = useState(0.6);
    const [decayRate, setDecayRate] = useState(20);
    // Input UX Thresholds (ms)
    const [tapThreshold, setTapThreshold] = useState(300);
    const [anchorThreshold, setAnchorThreshold] = useState(3000);
    const [resumeGuard, setResumeGuard] = useState(15000);

    const themeToggle = (
        <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('ui.button.theme_light') : t('ui.button.theme_dark')}
            data-tooltip={theme === 'dark' ? t('ui.button.theme_light') : t('ui.button.theme_dark')}
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
        <React.Fragment key={localeVersion}>
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
            {themeToggle}
        </React.Fragment>
    );

    if (status === 'error') return (
        <div className="void-screen" key={localeVersion}>
            <p className="frozen-message">
                {t('voice.error.steam_not_found')}
            </p>
            <button
                className="restart-selection-btn"
                onClick={() => init()}
            >
                {t('ui.button.sync')}
            </button>
            {themeToggle}
        </div>
    );

    if (status === 'onboarding') return (
        <React.Fragment key={localeVersion}>
            <OnboardingView onComplete={init} themeToggle={themeToggle} />
        </React.Fragment>
    );

    if (status === 'frozen') {
        return (
            <React.Fragment key={localeVersion}>
                <FrozenScreen onResume={() => setStatus('active')} guardMs={resumeGuard} />
                {themeToggle}
            </React.Fragment>
        );
    }

    if (face === 'kamae') {
        return (
            <div className="app-root" key={localeVersion}>
                <KamaeView onSwitchToRin={switchToRin} theme={theme} toggleTheme={toggleTheme} onLocaleChange={handleLocaleChange}
                    tourStep={tourStep} tourTotal={TOUR_TOTAL} onTourStart={startKamaeTour} onTourReplay={startFullTour} onTourClose={closeTour} onTourAdvance={advanceTour} onTourPrev={prevTour}
                    settingsRequested={settingsRequested} onSettingsOpened={() => setSettingsRequested(false)}
                    themeToggle={themeToggle}
                    updateCheck={updateCheck} updateAlertShown={updateAlertShown} />
                <VersionTag className="global-version-tag" updateCheck={updateCheck} updateAlertShown={updateAlertShown} />
                {import.meta.env.DEV && import.meta.env.VITE_AGENTATION && <div aria-hidden="true"><Agentation endpoint="http://localhost:4747" /></div>}
            </div>
        );
    }

    return (
        <div className="app-root" key={localeVersion}>
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
                tourStep={tourStep} tourTotal={TOUR_TOTAL} onTourStart={startTour} onTourClose={closeTour} onTourAdvance={advanceTour} onTourPrev={prevTour} hasSeenTour={hasSeenTour}
                themeToggle={themeToggle}
            />
            {/* No landmark role here — the <footer> inside RinView/KamaeView
                already carries role=contentinfo. Two contentinfo landmarks
                would confuse SR landmark navigation. */}
            <VersionTag className="global-version-tag" updateCheck={updateCheck} updateAlertShown={updateAlertShown} />
            {import.meta.env.DEV && import.meta.env.VITE_AGENTATION && <div aria-hidden="true"><Agentation endpoint="http://localhost:4747" /></div>}
        </div>
    );
}

export default App;
