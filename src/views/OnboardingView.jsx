import React, { useState, useRef, useEffect } from 'react';
import { t, getLocale, setLocale } from '../i18n';
import { useGameInput } from '../hooks/useGameInput';
import { createKata, addGameToKata } from '../core/katas';
import bridge from '../services/bridge';
import './OnboardingView.css';

// First-run language choice. Each label is the language's own name, in its
// own script — not translated — so a user can recognize their language even
// when the UI is currently showing a different one.
const LANGUAGES = [
    { value: 'en', label: 'English', htmlLang: 'en' },
    { value: 'ja', label: '日本語', htmlLang: 'ja' },
    { value: 'zh-CN', label: '简体中文', htmlLang: 'zh-CN' },
    { value: 'zh-TW', label: '繁體中文', htmlLang: 'zh-TW' },
];

export default function OnboardingView({ onComplete, themeToggle, onLocaleChange }) {
    // 'language' (first-run language choice) -> 'sync' (existing scan flow)
    const [step, setStep] = useState('language');
    const [state, setState] = useState('idle'); // 'idle' | 'scanning' | 'error'
    const [isFocused, setIsFocused] = useState(false);
    const btnRef = useRef(null);
    const titleRef = useRef(null);
    const langButtonRefs = useRef([]);
    const continueRef = useRef(null);

    // Helper to focus button and update state
    const focusButton = () => {
        if (btnRef.current) {
            btnRef.current.focus();
            setIsFocused(true);
        }
    };

    const focusLanguageStep = () => {
        const idx = Math.max(LANGUAGES.findIndex(l => l.value === getLocale()), 0);
        langButtonRefs.current[idx]?.focus();
    };

    const handleSelectLocale = (value) => {
        if (value === getLocale()) return;
        setLocale(value);
        onLocaleChange?.();
    };

    // Arrow keys / D-pad move focus linearly across the four language
    // options then the Continue button; they do not change the selection by
    // themselves (selection happens on click / Enter / gamepad A, same as
    // every other button in this app).
    const moveLanguageFocus = (dir) => {
        const items = [...langButtonRefs.current, continueRef.current].filter(Boolean);
        const activeIdx = items.indexOf(document.activeElement);
        if (activeIdx === -1) {
            items[0]?.focus();
            return;
        }
        let nextIdx = activeIdx;
        if (dir === 'right' || dir === 'down') nextIdx = Math.min(activeIdx + 1, items.length - 1);
        if (dir === 'left' || dir === 'up') nextIdx = Math.max(activeIdx - 1, 0);
        items[nextIdx]?.focus();
    };

    // On mount / re-mount (including the remount App.jsx forces on locale
    // change): focus the language step's current selection, or on the sync
    // step focus h1 so SR reads title + description first (error / window
    // re-focus: focus the action button).
    useEffect(() => {
        const timer = setTimeout(() => {
            if (step === 'language') {
                focusLanguageStep();
            } else if (state === 'idle' && titleRef.current) {
                titleRef.current.focus();
            } else {
                focusButton();
            }
        }, 0);
        const handleWindowFocus = () => {
            if (step === 'language') focusLanguageStep();
            else focusButton();
        };
        window.addEventListener('focus', handleWindowFocus);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('focus', handleWindowFocus);
        };
    }, [state, step]);

    // Track focus changes via document-level listeners
    useEffect(() => {
        const handleFocusIn = (e) => {
            // When button gains focus from any source (Tab, click, etc.)
            if (e.target === btnRef.current) {
                setIsFocused(true);
            }
        };
        const handleFocusOut = () => {
            // Check if button still has focus after event processes
            setTimeout(() => {
                if (document.activeElement !== btnRef.current) {
                    setIsFocused(false);
                }
            }, 0);
        };
        document.addEventListener('focusin', handleFocusIn);
        document.addEventListener('focusout', handleFocusOut);
        return () => {
            document.removeEventListener('focusin', handleFocusIn);
            document.removeEventListener('focusout', handleFocusOut);
        };
    }, []);

    // Gamepad support
    useGameInput({
        onMainAction: () => {
            if (step === 'sync') btnRef.current?.click();
        },
        onBack: () => {
            if (step === 'sync' && state === 'error') setState('idle');
        },
        onNav: (dir) => {
            if (step === 'language') moveLanguageFocus(dir);
            else focusButton();
        },
        disabled: step === 'sync' && state === 'scanning'
    });

    const handleSync = async () => {
        setState('scanning');

        // Timeout exit: After 8s, allow dismissal even if scanning
        const timer = setTimeout(() => {
            // This is just a UI hint, the scan continues in background
        }, 8000);

        const result = await bridge.requestOnboardingSync();
        clearTimeout(timer);

        if (result?.success) {
            // Create a demo kata with 3 random installed games
            // Small delay to ensure Rust atomic write completes
            await new Promise(r => setTimeout(r, 300));
            try {
                const gamesData = await bridge.getData('games');
                const installed = (gamesData?.games || []).filter(g => g.installed);
                if (installed.length >= 3) {
                    const shuffled = [...installed].sort(() => Math.random() - 0.5);
                    const demoKata = createKata('Demo Kata');
                    const withGames = shuffled.slice(0, 3).reduce(
                        (kata, game) => addGameToKata(kata, game.id || game.steamAppId),
                        demoKata
                    );
                    await bridge.saveShowcase({
                        games: [],
                        katas: [withGames],
                        activeKataId: withGames.id,
                    });
                }
            } catch {
                // Non-critical — proceed without demo kata
            }
            onComplete();
        } else {
            setState('error');
        }
    };

    if (step === 'language') {
        return (
            <main
                className="onboarding-container"
                aria-labelledby="onboarding-language-title"
                aria-describedby="onboarding-language-detail"
            >
                <section className="onboarding-content">
                    <h1 className="onboarding-title">Maida</h1>
                    <fieldset className="onboarding-language-fieldset">
                        <legend id="onboarding-language-title" className="onboarding-language-title">
                            {t('voice.onboarding.language_title')}
                        </legend>
                        <p id="onboarding-language-detail" className="onboarding-language-detail">
                            {t('voice.onboarding.language_detail')}
                        </p>
                        <div className="onboarding-language-options">
                            {LANGUAGES.map((option, i) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    ref={(el) => { langButtonRefs.current[i] = el; }}
                                    lang={option.htmlLang}
                                    className="onboarding-language-option"
                                    aria-pressed={getLocale() === option.value}
                                    onClick={() => handleSelectLocale(option.value)}
                                >
                                    {/* Non-color selected marker (review 2026-09-26 P3 R1): forced-colors
                                        strips the box-shadow/tint below, and this glyph stays visible once
                                        focus moves away, unlike the focus outline. Space is reserved on
                                        every option (visibility, not display) so selecting a different
                                        language never shifts the layout. */}
                                    <span className="onboarding-language-check" aria-hidden="true">&#10003;</span>
                                    <span className="onboarding-language-label">{option.label}</span>
                                </button>
                            ))}
                        </div>
                    </fieldset>
                    <div className="onboarding-actions">
                        <button
                            ref={continueRef}
                            type="button"
                            className="onboarding-language-continue"
                            onClick={() => setStep('sync')}
                        >
                            {t('ui.button.continue')}
                        </button>
                    </div>
                </section>
                <div className="bg-glow"></div>
                {themeToggle}
                <div className="app-version-tag">v{__APP_VERSION__}</div>
            </main>
        );
    }

    return (
        <main
            className="onboarding-container"
            aria-labelledby="onboarding-title"
            aria-describedby="onboarding-voice onboarding-detail"
        >
            <section className="onboarding-content">
                <h1 id="onboarding-title" ref={titleRef} className="onboarding-title" tabIndex={-1}>Maida</h1>
                <p id="onboarding-voice" className="onboarding-voice" aria-live="polite">
                    {state === 'error'
                        ? t('voice.error.steam_not_found')
                        : t('voice.onboarding.permission_intro')}
                </p>
                {state === 'idle' && (
                    <p id="onboarding-detail" className="onboarding-detail">{t('voice.onboarding.permission_detail')}</p>
                )}

                <div className="onboarding-actions">
                    {state === 'idle' && (
                        <button
                            ref={btnRef}
                            className={`onboarding-link${isFocused ? ' is-focused' : ''}`}
                            onClick={handleSync}
                        >
                            {t('ui.button.sync')}
                        </button>
                    )}

                    {state === 'scanning' && (
                        <div className="listening-indicator" role="status" aria-live="polite">
                            <span className="dot" aria-hidden="true"></span>
                            <span className="voice-text">{t('ui.status.scanning')}</span>
                        </div>
                    )}

                    {state === 'error' && (
                        <button
                            ref={btnRef}
                            className={`onboarding-link${isFocused ? ' is-focused' : ''}`}
                            onClick={() => setState('idle')}
                        >
                            {t('ui.button.acknowledge')}
                        </button>
                    )}
                </div>
            </section>
            <div className="bg-glow"></div>
            {themeToggle}
            <div className="app-version-tag">v{__APP_VERSION__}</div>
        </main>
    );
}
