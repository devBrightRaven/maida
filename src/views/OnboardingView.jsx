import React, { useState, useRef, useEffect } from 'react';
import { t } from '../i18n';
import { useGameInput } from '../hooks/useGameInput';
import CurationPrompt from '../ui/features/Onboarding/CurationPrompt';
import bridge from '../services/bridge';
import './OnboardingView.css';

export default function OnboardingView({ onComplete }) {
    const [state, setState] = useState('idle'); // 'idle' | 'scanning' | 'error' | 'curating'
    const [isFocused, setIsFocused] = useState(false);
    const btnRef = useRef(null);

    // Helper to focus button and update state
    const focusButton = () => {
        if (btnRef.current) {
            btnRef.current.focus();
            setIsFocused(true);
        }
    };

    // Auto-focus on mount and window focus
    useEffect(() => {
        // Use setTimeout to ensure button is rendered before focusing
        const timer = setTimeout(focusButton, 0);
        const handleWindowFocus = () => focusButton();
        window.addEventListener('focus', handleWindowFocus);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('focus', handleWindowFocus);
        };
    }, [state]); // Re-focus when state changes (idle <-> error)

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
            setState('curating');
        } else {
            setState('error');
        }
    };

    if (state === 'curating') {
        return (
            <main className="onboarding-container">
                <section className="onboarding-content" aria-label="Onboarding">
                    <h1 className="sr-only">Maida</h1>
                    <CurationPrompt onDone={onComplete} />
                </section>
                <div className="bg-glow"></div>
            </main>
        );
    }

    return (
        <main className="onboarding-container">
            <section className="onboarding-content" aria-label="Onboarding">
                <p className="onboarding-voice">
                    {state === 'error'
                        ? t('voice.error.steam_not_found')
                        : t('voice.onboarding.permission_intro')}
                </p>

                <div className="onboarding-actions">
                    {state === 'idle' && (
                        <>
                            <button
                                ref={btnRef}
                                className={`onboarding-link${isFocused ? ' is-focused' : ''}`}
                                onClick={handleSync}
                            >
                                {t('ui.button.sync')}
                            </button>
                            <p className="onboarding-hint">{t('voice.onboarding.permission_hint')}</p>
                        </>
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
