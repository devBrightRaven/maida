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
    const msgRef = useRef(null);
    const [ready, setReady] = useState(false);
    const totalSeconds = Math.ceil(guardMs / 1000);

    // Focus frozen message immediately so SR reads it (not theme toggle)
    useEffect(() => {
        msgRef.current?.focus();
    }, []);

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
            <p className="frozen-message" tabIndex={-1} ref={msgRef}>{t('ui.status.frozen')}</p>
            <button
                ref={btnRef}
                className="restart-selection-btn"
                aria-label={t('ui.button.im_back')}
                onClick={guardedResume}
                disabled={!ready}
            >
                {t('ui.button.im_back')}
            </button>
            <p className="sr-only" role="status" aria-live="assertive">
                {ready ? t('ui.status.frozen_ready') : t('ui.status.frozen_wait', { seconds: totalSeconds })}
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
    // Rin steps: 0=title, 1=prescription, 2=try, 3=notNow, 4=faceSwitch(interactive)
    // Kamae steps: 5=kata, 6=search, 7=gameList, 8=faceSwitchBack(interactive)
    const TOUR_TOTAL = 9;
    const [tourStep, setTourStep] = useState(null);
    const hasSeenTour = localStorage.getItem('maida-hasSeenTour') === 'true';

    const startTour = useCallback(() => setTourStep(0), []);
    const startKamaeTour = useCallback(() => setTourStep(5), []);
    const closeTour = useCallback(() => {
        setTourStep(null);
        localStorage.setItem('maida-hasSeenTour', 'true');
    }, []);
    const prevTour = useCallback(() => {
        setTourStep(s => {
            if (s === null || s <= 0) return s;
            // Don't go back across face boundaries (can't go from Kamae step 5 to Rin step 4)
            if (s === 5) return s;
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
        if (tourStep === 4) setTourStep(5);
    }, [focusMain, tourStep]);
    const switchToRin = useCallback(() => {
        setFace(prev => { if (prev === 'rin') return prev; reloadShowcase(); focusMain(); return 'rin'; });
        // Tour step 8 = face switch back to Rin (interactive) → tour ends
        if (tourStep === 8) { setTourStep(null); localStorage.setItem('maida-hasSeenTour', 'true'); }
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
    const [resumeGuard, setResumeGuard] = useState(5000);

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
            <OnboardingView onComplete={init} />
            {themeToggle}
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
                    tourStep={tourStep} tourTotal={TOUR_TOTAL} onTourStart={startKamaeTour} onTourClose={closeTour} onTourAdvance={advanceTour} onTourPrev={prevTour}
                    settingsRequested={settingsRequested} onSettingsOpened={() => setSettingsRequested(false)} />
                {themeToggle}
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
            />
            {themeToggle}
            <div className="global-version-tag" role="contentinfo">
                <span className="version-name">Maida マイダ</span>
                <span className="version-number">
                    v{__APP_VERSION__}
                    {updateCheck.isUpdateAvailable && ` → ${updateCheck.latestVersion}`}
                </span>
                {updateCheck.isUpdateAvailable && (
                    <>
                        {!updateAlertShown && (
                            <p className="sr-only" role="alert">
                                {t('ui.update.available_alert', { version: updateCheck.latestVersion })}
                            </p>
                        )}
                        <button
                            className="version-link"
                            onClick={updateCheck.installUpdate}
                            disabled={updateCheck.updating}
                            aria-label={t('ui.update.button_aria', { from: __APP_VERSION__, to: updateCheck.latestVersion })}
                        >
                            {updateCheck.updating ? t('ui.update.updating') : t('ui.update.button')}
                        </button>
                    </>
                )}
            </div>
            {import.meta.env.DEV && import.meta.env.VITE_AGENTATION && <div aria-hidden="true"><Agentation endpoint="http://localhost:4747" /></div>}
        </div>
    );
}

export default App;
