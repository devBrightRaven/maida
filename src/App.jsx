import React, { useState, useEffect, useRef, useCallback } from 'react';
import RinView from './views/RinView';
import KamaeView from './views/KamaeView';
import Maida2View from './views/Maida2View';
import OnboardingView from './views/OnboardingView';
import FaceSwitchButton from './ui/FaceSwitchButton';
import VersionTag from './ui/VersionTag';
import AccessibilityPage from './ui/pages/AccessibilityPage';
import PrivacyPage from './ui/pages/PrivacyPage';
import TermsPage from './ui/pages/TermsPage';
import { calculateTraceWeights, updateDebugTrace } from './core/engine';
import { createHook, retractHook, setGameState, EMPTY_HOOKS_STATE } from './core/hooks';
import { buildTraceEvent, getWriterIdentity } from './core/trace';
import { bucketGames } from './core/zones';
import { pickPostLaunch } from './core/prescriptionPicker';
import { loadData, saveData } from './services/persistence';
import { useMaidaSession } from './hooks/useMaidaSession';
import { useUpdateCheck } from './hooks/useUpdateCheck';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
import { STEP, TOUR_TOTAL } from './tourSteps';
import { useTheme } from './hooks/useTheme';
import { useGameInput } from './hooks/useGameInput';
import { useGamepadScroll } from './hooks/useGamepadScroll';
import bridge from './services/bridge';

import { Agentation } from 'agentation';
import { t, getLocale } from './i18n';
import { loadPrescriptionTranslations, localizePrescription } from './i18n/prescriptions';
import { secondsToWord } from './i18n/numbers';
import './App.css';

// Load prescription translations for detected locale (fire-and-forget)
loadPrescriptionTranslations();

// Maida 2.0 trace append with pending retry. Failed events are queued and
// retried before the next append. hooks.json is the state authority; trace
// is history only, so a failure is logged, never blocking.
const pendingTraceEvents = [];
async function appendTraceEvents(events) {
    const batch = [...pendingTraceEvents.splice(0), ...events];
    for (let i = 0; i < batch.length; i++) {
        try {
            await bridge.appendTrace(batch[i]);
        } catch (e) {
            // Queue the failed event AND everything after it, so per-writer
            // order is preserved on retry (no later event jumps the queue).
            pendingTraceEvents.push(...batch.slice(i));
            console.error('[Maida2] appendTrace failed (queued for retry):', e);
            return;
        }
    }
}

// One maida.decision.presented + maida.playtime.snapshot per app boot.
let bootTraceSent = false;

// Frozen state screen with gamepad support
// Input guard: cooldown on mount to prevent accidental double-tap from TRY
function FrozenScreen({ onResume, guardMs = 5000, prescriptionLine = null, onCyclePrescription = null }) {
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
        onNav: (dir) => {
            // Left/right cycles the static prescription line. Visual only, no
            // announcements — the two live regions stay untouched (red line 7.5).
            if ((dir === 'left' || dir === 'right') && prescriptionLine && onCyclePrescription) {
                onCyclePrescription(dir === 'right' ? 1 : -1);
                return;
            }
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
            {/* Static text, deliberately NOT a live region and not adjacent to the
                sr-only announcer below — red line 7.5 keeps exactly two live regions. */}
            {prescriptionLine && <p id="frozen-prescription" className="frozen-prescription">{prescriptionLine}</p>}
            <button
                ref={btnRef}
                className="restart-selection-btn"
                aria-label={ready ? t('ui.button.im_back') : t('ui.button.im_back_wait')}
                aria-describedby={prescriptionLine ? 'frozen-prescription' : undefined}
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

    // Right analog stick → global scroll. Mounted once at App root.
    useGamepadScroll();


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

    // Face switching (Maida2 ↔ Kamae; Rin stays reachable via tour/debug paths only)
    const [face, setFace] = useState('maida2');
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
    const switchToMaida2 = useCallback(() => {
        setFace(prev => { if (prev === 'maida2') return prev; focusMain(); return 'maida2'; });
    }, [focusMain]);
    // Ctrl+Tab restored to the original 1.x pair: rin ↔ kamae (user ruling
    // 2026-08-31). Maida2 has its own direct key (F9) and L1.
    const toggleFace = useCallback(() => setFace(f => f === 'rin' ? 'kamae' : 'rin'), []);

    // Open settings: from Rin → switch to Kamae settings, from Kamae → open settings panel
    const [settingsRequested, setSettingsRequested] = useState(false);
    // Remembers which face F10/Menu was opened FROM, so closing settings can
    // return there instead of stranding the user on Kamae. Only set when
    // settings borrowed Kamae from another face; opening from Kamae directly
    // leaves this null so closing behaves exactly as today.
    const settingsReturnFaceRef = useRef(null);
    const openSettings = useCallback(() => {
        // Settings panel lives in KamaeView — switch there first if needed
        setSettingsRequested(true);
        if (face !== 'kamae') {
            settingsReturnFaceRef.current = face;
            switchToKamae();
        }
    }, [face, switchToKamae]);
    const handleSettingsClosed = useCallback(() => {
        if (settingsReturnFaceRef.current === 'maida2') switchToMaida2();
        settingsReturnFaceRef.current = null;
    }, [switchToMaida2]);

    // Legal pages and the settings panel are modals owned by RinView /
    // KamaeView. While either is open, face-switching would abandon the
    // reading or configuring context without the user explicitly saying
    // "I'm done" (B / Esc / the back button). We gate on DOM presence so
    // neither view has to lift its modal state up to App.
    const isModalOpen = () =>
        typeof document !== 'undefined' && (
            !!document.querySelector('main.legal-page') ||
            !!document.querySelector('.kamae-settings') ||
            !!document.querySelector('.m2-note-input')
        );

    // L1/R1 gamepad face switching + Menu button
    useGameInput({
        onL1: () => { if (!isModalOpen()) switchToMaida2(); },
        onR1: () => { if (!isModalOpen()) switchToKamae(); },
        onMenu: openSettings,
    });

    // Ctrl+Tab keyboard shortcut (undocumented)
    useEffect(() => {
        const handler = (e) => {
            if (e.ctrlKey && e.key === 'Tab') {
                if (isModalOpen()) return;
                e.preventDefault();
                toggleFace();
            }
            if (e.key === 'F8') {
                e.preventDefault();
                if (!isModalOpen()) switchToRin();
            }
            if (e.key === 'F9') {
                e.preventDefault();
                if (!isModalOpen()) switchToMaida2();
            }
            if (e.key === 'F10') {
                e.preventDefault();
                openSettings();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [toggleFace, openSettings, switchToMaida2, switchToRin]);

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

    // Load persisted frozen guard duration on mount. Bridge returns seconds;
    // resumeGuard is stored in ms so the FrozenScreen API doesn't change.
    useEffect(() => {
        let cancelled = false;
        bridge.getFrozenGuardDuration().then((seconds) => {
            if (!cancelled && typeof seconds === 'number') {
                setResumeGuard(seconds * 1000);
            }
        });
        return () => { cancelled = true; };
    }, []);

    const handleFrozenGuardChange = useCallback((seconds) => {
        setResumeGuard(seconds * 1000);
    }, []);

    // Maida 2.0 focus-expansion dwell-to-play delay (1 / 3 / 6 seconds; default 3)
    const [maida2PlayDelaySeconds, setMaida2PlayDelaySeconds] = useState(3);
    useEffect(() => {
        let cancelled = false;
        bridge.getMaida2PlayDelaySeconds().then((seconds) => {
            if (!cancelled && typeof seconds === 'number') setMaida2PlayDelaySeconds(seconds);
        });
        return () => { cancelled = true; };
    }, []);
    const handleMaida2PlayDelayChange = useCallback((seconds) => {
        setMaida2PlayDelaySeconds(seconds);
    }, []);

    // Maida 2.0 dwell-to-play preview audio (default on, user ruling 2026-08-31)
    const [maida2PreviewAudio, setMaida2PreviewAudio] = useState(true);
    useEffect(() => {
        let cancelled = false;
        bridge.getMaida2PreviewAudio().then((enabled) => {
            if (!cancelled && typeof enabled === 'boolean') setMaida2PreviewAudio(enabled);
        });
        return () => { cancelled = true; };
    }, []);
    const handleMaida2PreviewAudioChange = useCallback((enabled) => {
        setMaida2PreviewAudio(enabled);
    }, []);

    // Maida 2.0 card opacity (percent, 40..=100, default 70)
    const [maida2CardOpacity, setMaida2CardOpacity] = useState(70);
    useEffect(() => {
        let cancelled = false;
        bridge.getMaida2CardOpacity().then((percent) => {
            if (!cancelled && typeof percent === 'number') setMaida2CardOpacity(percent);
        });
        return () => { cancelled = true; };
    }, []);
    const handleMaida2CardOpacityChange = useCallback((percent) => {
        setMaida2CardOpacity(percent);
    }, []);

    // ===== Maida 2.0 =====
    // hooks state lives at App level (useMaidaSession stays dice-coupled, untouched)
    const [hooksState, setHooksState] = useState(null); // null until loadData resolves
    const [m2LegalPage, setM2LegalPage] = useState(null);
    const m2LegalReturnRef = useRef(null);
    // Frozen prescription: seed increments once per freeze; left/right cycling offset
    const frozenSeed = useRef({ active: false, count: 0 });
    const [frozenCycle, setFrozenCycle] = useState(0);
    const lastLaunchedRef = useRef(null); // id of the last maida2-launched game

    useEffect(() => {
        let cancelled = false;
        // prev ?? ...: never clobber state that a user action already produced
        // while the load was in flight (a plain set would wipe hooks.json).
        loadData('hooks').then((h) => { if (!cancelled) setHooksState(prev => prev ?? (h || EMPTY_HOOKS_STATE)); });
        return () => { cancelled = true; };
    }, []);

    // Trace subject contract: steam appid when the game has one, otherwise the
    // slug id under the 'maida' namespace. Hook actions carry only gameId, so
    // resolve against the loaded library here.
    const buildHookTraceEvent = useCallback((input) => {
        const g = (data.games?.games || []).find(x => x.id === input.subjectId);
        return buildTraceEvent(
            g?.steamAppId != null
                ? { ...input, subjectId: String(g.steamAppId), namespace: 'steam', writer: getWriterIdentity() }
                : { ...input, namespace: 'maida', writer: getWriterIdentity() }
        );
    }, [data.games]);

    const handleHookAction = useCallback((action) => {
        if (hooksState === null) {
            // hooks.json not loaded yet: acting on EMPTY state here would
            // overwrite the persisted file with a near-empty one.
            console.warn('[Maida2] hook action ignored: hooks state still loading');
            return null;
        }
        let result;
        if (action.type === 'create') result = createHook(hooksState, action, buildHookTraceEvent);
        else if (action.type === 'retract') result = retractHook(hooksState, action.hookId, buildHookTraceEvent);
        else if (action.type === 'setState') result = setGameState(hooksState, action.gameId, action.state, buildHookTraceEvent);
        if (!result || result.traceEvents.length === 0) return null; // unknown or no-op action
        setHooksState(result.nextState);
        saveData('hooks', result.nextState).catch((e) => console.error('[Maida2] saveData(hooks) failed:', e));
        appendTraceEvents(result.traceEvents);
        return result;
    }, [hooksState, buildHookTraceEvent]);

    // Launch from Maida2: trace + Steam launch + freeze. Deliberately NOT via
    // handleAction/session.game — those are dice-coupled.
    const handleMaida2Launch = useCallback((game) => {
        if (!game) return;
        lastLaunchedRef.current = game.id;
        appendTraceEvents([buildTraceEvent({
            eventType: 'maida.launch.initiated',
            subjectId: game.steamAppId != null ? String(game.steamAppId) : game.id,
            namespace: game.steamAppId != null ? 'steam' : 'maida',
            displayTitle: game.title,
            writer: getWriterIdentity(),
            payload: { steamUrl: game.steamUrl },
        })]);
        if (game.steamUrl) bridge.launchGame(game.steamUrl);
        setStatus('frozen');
    }, [setStatus]);

    // Per-boot observability: zones presented + playtime snapshot (fire-and-forget)
    useEffect(() => {
        if (bootTraceSent || !hooksState || !Array.isArray(data.games?.games)) return;
        const games = data.games.games;
        // Post-snapshot data always carries steamLastPlayed; legacy pre-snapshot
        // data lacks it. Firing before the background snapshot merge would
        // permanently record steamLastPlayed: 0 for every game.
        if (!games.some(g => 'steamLastPlayed' in g)) return;
        bootTraceSent = true;
        const zones = bucketGames({ games, hooksState });
        appendTraceEvents([
            buildTraceEvent({
                eventType: 'maida.decision.presented',
                subjectId: 'library', // boot-level event, no single appid
                namespace: 'maida',
                writer: getWriterIdentity(),
                payload: {
                    zones: {
                        now: { count: zones.now.length, gameIds: zones.now.map(g => String(g.id)) },
                        stillHere: { count: zones.stillHere.length, gameIds: zones.stillHere.map(e => String(e.game.id)) },
                        recentlyArrived: { count: zones.recentlyArrived.length, gameIds: zones.recentlyArrived.map(g => String(g.id)) },
                    },
                },
            }),
            buildTraceEvent({
                eventType: 'maida.playtime.snapshot',
                subjectId: 'library',
                namespace: 'maida',
                writer: getWriterIdentity(),
                payload: {
                    games: games.filter(g => g.installed).map(g => ({ id: String(g.id), steamLastPlayed: g.steamLastPlayed || 0 })),
                },
            }),
        ]);
    }, [data.games, hooksState]);

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
        // Rin-path freezes have no maida2 launch context: a stale slug from an
        // earlier maida2 launch must not pick that game's prescriptions here.
        if (face !== 'maida2') lastLaunchedRef.current = null;
        // Seed bumps once per freeze (guarded, so StrictMode double-render is safe)
        if (!frozenSeed.current.active) {
            frozenSeed.current = { active: true, count: frozenSeed.current.count + 1 };
        }
        const { pick } = pickPostLaunch(data.prescriptions?.prescriptions, {
            slug: lastLaunchedRef.current != null ? String(lastLaunchedRef.current) : undefined,
            seedIndex: frozenSeed.current.count + frozenCycle,
        });
        const line = pick ? localizePrescription(pick) : null;
        return (
            <React.Fragment key={localeVersion}>
                <FrozenScreen
                    onResume={() => { setFrozenCycle(0); setStatus('active'); }}
                    guardMs={resumeGuard}
                    prescriptionLine={line ? (line.interface || line.kernel) : null}
                    onCyclePrescription={(delta) => setFrozenCycle(c => c + delta)}
                />
                {themeToggle}
            </React.Fragment>
        );
    }
    frozenSeed.current.active = false;

    if (face === 'maida2') {
        if (m2LegalPage) {
            const pages = { accessibility: AccessibilityPage, privacy: PrivacyPage, terms: TermsPage };
            const Page = pages[m2LegalPage];
            return Page ? <Page onClose={() => { setM2LegalPage(null); requestAnimationFrame(() => m2LegalReturnRef.current?.focus()); }} /> : null;
        }
        return (
            <div className="app-root" key={localeVersion}>
                <Maida2View
                    games={data.games?.games || []}
                    hooksState={hooksState || EMPTY_HOOKS_STATE}
                    onHookAction={handleHookAction}
                    onLaunch={handleMaida2Launch}
                    themeToggle={themeToggle}
                    onNavigateLegal={(page) => { m2LegalReturnRef.current = document.activeElement; setM2LegalPage(page); }}
                    playDelaySeconds={maida2PlayDelaySeconds}
                    previewAudio={maida2PreviewAudio}
                    cardOpacity={maida2CardOpacity}
                />
                <VersionTag className="global-version-tag" updateCheck={updateCheck} updateAlertShown={updateAlertShown} />
                {import.meta.env.DEV && import.meta.env.VITE_AGENTATION && <div aria-hidden="true"><Agentation endpoint="http://localhost:4747" /></div>}
            </div>
        );
    }

    if (face === 'kamae') {
        return (
            <div className="app-root" key={localeVersion}>
                <KamaeView onSwitchToRin={switchToRin} theme={theme} toggleTheme={toggleTheme} onLocaleChange={handleLocaleChange}
                    tourStep={tourStep} tourTotal={TOUR_TOTAL} onTourStart={startKamaeTour} onTourReplay={startFullTour} onTourClose={closeTour} onTourAdvance={advanceTour} onTourPrev={prevTour}
                    settingsRequested={settingsRequested} onSettingsOpened={() => setSettingsRequested(false)} onSettingsClosed={handleSettingsClosed}
                    themeToggle={themeToggle}
                    onFrozenGuardChange={handleFrozenGuardChange}
                    onMaida2PlayDelayChange={handleMaida2PlayDelayChange}
                    onMaida2PreviewAudioChange={handleMaida2PreviewAudioChange}
                    onMaida2CardOpacityChange={handleMaida2CardOpacityChange}
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
