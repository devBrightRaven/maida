import React, { useState, useRef, useEffect } from 'react';
import { t } from '../i18n';
import { useGameInput } from '../hooks/useGameInput';
import { createKata, addGameToKata } from '../core/katas';
import bridge from '../services/bridge';
import './OnboardingView.css';

export default function OnboardingView({ onComplete }) {
    const [state, setState] = useState('idle'); // 'idle' | 'scanning' | 'error'
    const [isFocused, setIsFocused] = useState(false);
    const btnRef = useRef(null);
    const titleRef = useRef(null);

    // Helper to focus button and update state
    const focusButton = () => {
        if (btnRef.current) {
            btnRef.current.focus();
            setIsFocused(true);
        }
    };

    // On mount: focus h1 so SR reads title + description first.
    // On error / window re-focus: focus the action button.
    useEffect(() => {
        const timer = setTimeout(() => {
            if (state === 'idle' && titleRef.current) {
                titleRef.current.focus();
            } else {
                focusButton();
            }
        }, 0);
        const handleWindowFocus = () => focusButton();
        window.addEventListener('focus', handleWindowFocus);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('focus', handleWindowFocus);
        };
    }, [state]);

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
        onMainAction: () => btnRef.current?.click(),
        onBack: () => {
            if (state === 'error') setState('idle');
        },
        onNav: () => focusButton(),
        disabled: state === 'scanning'
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

    return (
        <main className="onboarding-container" aria-labelledby="onboarding-title">
            <section className="onboarding-content">
                <h1 id="onboarding-title" ref={titleRef} className="onboarding-title" tabIndex={-1}>Maida</h1>
                <p className="onboarding-voice" aria-live="polite" tabIndex={0}>
                    {state === 'error'
                        ? t('voice.error.steam_not_found')
                        : t('voice.onboarding.permission_intro')}
                </p>
                {state === 'idle' && (
                    <p className="onboarding-detail" tabIndex={0}>{t('voice.onboarding.permission_detail')}</p>
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
                        <div className="listening-indicator">
                            <span className="dot"></span>
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
            <div className="app-version-tag">v{__APP_VERSION__}</div>
        </main>
    );
}
