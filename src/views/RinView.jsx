import React, { useState, useEffect } from 'react';
import { t } from '../i18n';
import { formatPlaytime } from '../core/format';
import GameDisplay from '../ui/features/Uncertainty/GameDisplay';
import TracePanel from '../ui/features/Trace/TracePanel';
import GuidedTour from '../ui/features/GuidedTour/GuidedTour';
import FaceSwitchButton from '../ui/FaceSwitchButton';
import { useGameInput } from '../hooks/useGameInput';
import CalligraphyBg from '../ui/CalligraphyBg';
import Footer from '../ui/Footer';
import AccessibilityPage from '../ui/pages/AccessibilityPage';
import PrivacyPage from '../ui/pages/PrivacyPage';
import TermsPage from '../ui/pages/TermsPage';
import './RinView.css';

/**
 * RinView
 * The single, low-presence interface for the Maida MVP.
 */
export default function RinView({
    game,
    prescription,
    onAction,
    debugMode,
    silentMode,
    setSilentMode,
    onSecretTap,
    temperature,
    decayRate,
    onSimulation,
    canUndo,
    isAnchored = false,
    returnPenaltySet,
    tapThreshold,
    anchorThreshold,
    resumeGuard,
    onHideGame,
    onSwitchToKamae,
    tourStep,
    tourTotal,
    onTourStart,
    onTourClose,
    onTourAdvance,
    onTourPrev,
    hasSeenTour
}) {
    const [expanded, setExpanded] = useState(false);
    const [showTrace, setShowTrace] = useState(false);
    const [showSpotlight, setShowSpotlight] = useState(!hasSeenTour);
    const [legalPage, setLegalPage] = useState(null);
    const legalReturnRef = React.useRef(null);
    const [focusedBtn, setFocusedBtn] = useState(null); // 'visit' | 'notToday' | 'back' | 'switchKamae' | null
    const showTour = tourStep !== null && tourStep >= 0 && tourStep <= 4;

    // Refs for Focus Management
    const titleRef = React.useRef(null);
    const prescriptionRef = React.useRef(null);
    const helpBtnRef = React.useRef(null);
    const btnRefs = {
        visit: React.useRef(null),
        notToday: React.useRef(null),
        back: React.useRef(null),
        switchKamae: React.useRef(null)
    };

    // Helper to focus a button and update state
    const focusBtn = (name) => {
        const ref = btnRefs[name];
        if (ref?.current) {
            ref.current.focus();
            setFocusedBtn(name);
        }
    };

    // Auto-focus game title — SR reads game name first, user Tab to buttons
    useEffect(() => {
        const timer = setTimeout(() => {
            if (titleRef.current) {
                titleRef.current.focus();
            } else {
                focusBtn('notToday');
            }
        }, 0);
        return () => clearTimeout(timer);
    }, [game, isAnchored]);

    // Auto-focus when window gains focus (e.g. switching back from background)
    useEffect(() => {
        const handleWindowFocus = () => {
            const current = document.activeElement;
            // If nothing is focused, grab focus to primary button
            if (!current || current === document.body) {
                focusBtn('notToday');
            }
        };

        window.addEventListener('focus', handleWindowFocus);
        // Also run on mount to ensure initial focus
        handleWindowFocus();

        return () => {
            window.removeEventListener('focus', handleWindowFocus);
        };
    }, [game]);

    // Restore focus when TracePanel closes
    useEffect(() => {
        if (!showTrace) {
            // Small delay to ensure panel is fully unmounted
            requestAnimationFrame(() => {
                focusBtn('notToday');
            });
        }
    }, [showTrace, game]);

    // Track focus changes via document-level listeners
    useEffect(() => {
        const handleFocusIn = (e) => {
            // When a button gains focus from any source (Tab, click, etc.)
            if (e.target === btnRefs.visit.current) setFocusedBtn('visit');
            else if (e.target === btnRefs.notToday.current) setFocusedBtn('notToday');
            else if (e.target === btnRefs.back.current) setFocusedBtn('back');
        };
        const handleFocusOut = () => {
            // Check if any of our buttons still has focus after event processes
            setTimeout(() => {
                const active = document.activeElement;
                if (active === btnRefs.visit.current) setFocusedBtn('visit');
                else if (active === btnRefs.notToday.current) setFocusedBtn('notToday');
                else if (active === btnRefs.back.current) setFocusedBtn('back');
                else setFocusedBtn(null);
            }, 0);
        };
        document.addEventListener('focusin', handleFocusIn);
        document.addEventListener('focusout', handleFocusOut);
        return () => {
            document.removeEventListener('focusin', handleFocusIn);
            document.removeEventListener('focusout', handleFocusOut);
        };
    }, []);

    // Auto-dismiss spotlight after 8 seconds
    useEffect(() => {
        if (!showSpotlight) return;
        const timer = setTimeout(() => setShowSpotlight(false), 8000);
        return () => clearTimeout(timer);
    }, [showSpotlight]);

    // F1 opens guided tour (H conflicts with SR heading navigation)
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'F1' && !showTrace && !showTour) {
                e.preventDefault();
                onTourStart();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [showTrace, showTour, onTourStart]);

    // Input Hook for Gamepad & Keyboard
    const { longPressProgress, handlers } = useGameInput({
        disabled: !game || showTrace || showTour, // Disable when no game, trace panel, or tour is open
        tapThreshold,
        anchorThreshold,
        onMainAction: () => onAction('visit'), // Short Press A
        onAnchor: () => {
            if (!isAnchored) onAction('anchor'); // Long Press A (3s)
        },
        onBack: () => {
            if (isAnchored) {
                onAction('release'); // B -> Clear Anchor
            } else {
                // Two-step: B/Escape focuses NOT NOW, user must confirm with A/Enter
                focusBtn('notToday');
            }
        },
        onNav: (dir) => {
            const current = document.activeElement;

            const isVisit = current === btnRefs.visit.current;
            const isNotToday = current === btnRefs.notToday.current;
            const isBack = current === btnRefs.back.current;
            const isTraceBtn = current?.classList?.contains('debug-trace-btn');
            const isSwitchKamae = current === btnRefs.switchKamae.current;
            const isHelpBtn = current === helpBtnRef.current;
            const isFooterBtn = current?.closest('.app-footer');
            const isKnownButton = isVisit || isNotToday || isBack || isTraceBtn || isSwitchKamae || isHelpBtn || isFooterBtn;

            // Fallback: If focus is lost, on body, or on unknown element, grab NOT NOW
            if (!current || current === document.body || !isKnownButton) {
                focusBtn('notToday');
                return;
            }

            // Up / Left = Previous (backwards)
            if (dir === 'left' || dir === 'up') {
                if (isNotToday) focusBtn('visit');
                else if (isBack) focusBtn('notToday');
                else if (isTraceBtn) focusBtn('visit');
                else if (isHelpBtn) focusBtn('switchKamae');
                else if (isSwitchKamae) canUndo ? focusBtn('back') : focusBtn('notToday');
                else {
                    // Navigate within footer buttons or back to main
                    const footerBtns = Array.from(document.querySelectorAll('.app-footer button'));
                    const idx = footerBtns.indexOf(current);
                    if (idx > 0) {
                        footerBtns[idx - 1].focus();
                    } else if (idx === 0) {
                        helpBtnRef.current?.focus();
                    }
                }
            }
            // Down / Right = Next (forwards)
            else if (dir === 'right' || dir === 'down') {
                if (isVisit) focusBtn('notToday');
                else if (isNotToday && canUndo) focusBtn('back');
                else if (isNotToday && !canUndo) focusBtn('switchKamae');
                else if (isBack) focusBtn('switchKamae');
                else if (isSwitchKamae) {
                    helpBtnRef.current?.focus();
                } else if (isHelpBtn) {
                    const footer = document.querySelector('.app-footer button');
                    if (footer) footer.focus();
                } else {
                    // Navigate within footer buttons
                    const footerBtns = Array.from(document.querySelectorAll('.app-footer button'));
                    const idx = footerBtns.indexOf(current);
                    if (idx >= 0 && idx < footerBtns.length - 1) {
                        footerBtns[idx + 1].focus();
                    } else if (idx === footerBtns.length - 1) {
                        focusBtn('notToday');
                    }
                }
            }
        }
    });

    if (!prescription) return null;

    if (legalPage) {
        const pages = {
            accessibility: AccessibilityPage,
            privacy: PrivacyPage,
            terms: TermsPage,
        };
        const Page = pages[legalPage];
        return Page ? <Page onClose={() => { setLegalPage(null); requestAnimationFrame(() => legalReturnRef.current?.focus()); }} /> : null;
    }

    const handleContainerClick = (e) => {
        // Prevent focus loss: always re-focus primary button when clicking non-button areas
        if (!e.target.closest('button')) {
            if (game) {
                focusBtn('visit');
            } else {
                focusBtn('notToday');
            }
        }

        // Debug mode expand
        if (debugMode && !e.target.closest('button') && !e.target.closest('.mvp-header')) {
            setExpanded(!expanded);
        }
    };

    return (
        <>
        <div className="rin-title-block" aria-hidden="true">
            <p className="rin-title-reading">{t('ui.rin.reading')}</p>
            <p className="rin-title-desc">{t('ui.rin.desc')}</p>
        </div>
        <main
            className={`mvp-container ${!game ? 'is-idle' : ''} ${debugMode ? 'debug-mode' : ''} ${expanded ? 'is-expanded' : ''} ${isAnchored ? 'is-anchored' : ''}`}
            onClick={handleContainerClick}
        >
            <p className="sr-only" role="alert">{t('ui.rin.sr_guide')}</p>
            {!hasSeenTour && (
                <p className="sr-only" aria-live="polite">{t('ui.tour.sr_hint')}</p>
            )}
            <CalligraphyBg char="臨" className="rin-calligraphy-bg" />
            {game && (
                <header className="mvp-header">
                    <div className="mvp-header-tap" onClick={onSecretTap} aria-hidden="true" />
                    <h1 className="game-label" ref={titleRef} tabIndex={-1}>
                        <span className="sr-only">{t('ui.rin.mode_prefix')}</span>
                        {isAnchored ? `(⚓${t('ui.game.anchored_prefix')}) ${game.title}` : game.title}
                    </h1>
                    {(() => {
                        const ttb = game.igdb?.timeToBeat?.normally ?? game.hltb?.mainStory ?? null;
                        const display = formatPlaytime(ttb);
                        return display ? <span className="game-hltb-time">~{display}</span> : null;
                    })()}
                </header>
            )}

            {!game && (
                <div className="idle-debug-trigger" onClick={onSecretTap}></div>
            )}

            <div ref={prescriptionRef}>
                <GameDisplay
                    game={game}
                    prescription={prescription}
                    debugMode={debugMode}
                    isExpanded={expanded}
                    onSecretTap={onSecretTap}
                />
            </div>

            <footer className="mvp-footer">
                <div className="action-row">
                    {game && (
                        <div className="primary-actions">
                            <button
                                ref={btnRefs.visit}
                                className={`mvp-btn visit ${isAnchored ? 'anchored-btn' : ''} ${focusedBtn === 'visit' ? 'is-focused' : ''}`}
                                aria-label={isAnchored ? t('ui.button.play_aria', { game: game.title }) : t('ui.button.try_aria', { game: game.title })}
                                aria-describedby={!isAnchored ? 'visit-hint' : undefined}
                                onMouseEnter={() => focusBtn('visit')}
                                // Pointer Events for unified input handling
                                onPointerDown={handlers.onPressStart}
                                onPointerUp={handlers.onPressEnd}
                                onPointerLeave={handlers.onPressCancel}
                                onPointerCancel={handlers.onPressCancel}
                                // Keyboard hold for anchor (Enter/Space)
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); handlers.onPressStart(); } }}
                                onKeyUp={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlers.onPressEnd(); } }}
                                onClick={(e) => { e.stopPropagation(); }}
                            >
                                {isAnchored ? t('ui.button.play') : (
                                    <div className="visit-btn-content">
                                        <span className="visit-btn-title">{t('ui.button.try')}</span>
                                        <span id="visit-hint" className="visit-btn-subtitle">{t('ui.button.try_hint')}</span>
                                    </div>
                                )}
                                {/* Long Press Progress Bar */}
                                {longPressProgress > 0 && !isAnchored && (
                                    <div
                                        className="btn-progress"
                                        role="progressbar"
                                        aria-valuenow={Math.round(longPressProgress * 100)}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-label={t('ui.button.try_hint')}
                                        style={{ width: `${longPressProgress * 100}%` }}
                                    ></div>
                                )}
                            </button>

                            <button
                                ref={btnRefs.notToday}
                                className={`mvp-btn not-today ${focusedBtn === 'notToday' ? 'is-focused' : ''}`}
                                aria-label={isAnchored ? t('ui.button.clear_aria', { game: game.title }) : t('ui.button.not_now_aria')}
                                onMouseEnter={() => focusBtn('notToday')}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (isAnchored) onAction('release');
                                    else onAction('skip');
                                }}
                            >
                                {isAnchored ? t('ui.button.clear') : t('ui.button.not_now')}
                            </button>
                        </div>
                    )}

                    <button
                        ref={btnRefs.back}
                        className={`mvp-btn back-link ${(!canUndo || isAnchored) ? 'is-hidden' : ''} ${focusedBtn === 'back' ? 'is-focused' : ''}`}
                        aria-label={t('ui.button.back')}
                        onMouseEnter={() => focusBtn('back')}
                        onClick={(e) => { e.stopPropagation(); if (canUndo && !isAnchored) onAction('back'); }}
                        disabled={!canUndo || isAnchored}
                        tabIndex={(!canUndo || isAnchored) ? -1 : 0}
                        aria-hidden={!canUndo || isAnchored}
                    >
                        {t('ui.button.back')}
                    </button>
                </div>

            </footer>

            {debugMode && (
                <div className="debug-controls">
                    <button className="debug-trace-btn" aria-label="Open debug trace panel" onClick={(e) => { e.stopPropagation(); setShowTrace(true); }}>
                        {t('ui.debug.trace_btn')}
                    </button>
                </div>
            )}

            <div className="bg-glow"></div>

            {debugMode && showTrace && (
                <TracePanel
                    game={game}
                    temperature={temperature}
                    decayRate={decayRate}
                    silentMode={silentMode}
                    setSilentMode={setSilentMode}
                    onSimulation={onSimulation}
                    onClose={() => setShowTrace(false)}
                    tapThreshold={tapThreshold}
                    anchorThreshold={anchorThreshold}
                    resumeGuard={resumeGuard}
                    isAnchored={isAnchored}
                    returnPenaltySet={returnPenaltySet}
                    onHideGame={onHideGame}
                />
            )}

            {onSwitchToKamae && (
                <FaceSwitchButton ref={btnRefs.switchKamae} direction="to-kamae" onClick={onSwitchToKamae} />
            )}

            <button
                ref={helpBtnRef}
                className={`help-tour-btn ${showSpotlight ? 'help-tour-btn--spotlight' : ''}`}
                aria-label={t('ui.tour.help_aria')}
                data-tooltip={t('ui.tour.help_tooltip')}
                onClick={() => { setShowSpotlight(false); onTourStart(); }}
            >
                ?
            </button>

            {showSpotlight && game && !showTour && (
                <div
                    className="help-spotlight-overlay"
                    onClick={() => setShowSpotlight(false)}
                    aria-hidden="true"
                >
                    <div className="help-spotlight-hint">
                        <span className="help-spotlight-arrow">&#x2191;</span>
                        <span>{t('ui.tour.spotlight_hint')}</span>
                    </div>
                </div>
            )}

            {showTour && game && (() => {
                const rinSteps = [
                    { targetRef: titleRef, text: t('ui.tour.step_title') },
                    { targetRef: prescriptionRef, text: t('ui.tour.step_prescription') },
                    { targetRef: btnRefs.visit, text: t('ui.tour.step_try') },
                    { targetRef: btnRefs.notToday, text: t('ui.tour.step_not_now') },
                    { targetRef: btnRefs.switchKamae, text: t('ui.tour.step_switch_kamae'), interactive: true },
                ];
                return (
                    <GuidedTour
                        steps={rinSteps}
                        localIndex={tourStep}
                        globalIndex={tourStep}
                        totalSteps={tourTotal}
                        onClose={onTourClose}
                        onAdvance={onTourAdvance}
                        onPrev={onTourPrev}
                    />
                );
            })()}

            <Footer onNavigate={(page) => { legalReturnRef.current = document.activeElement; setLegalPage(page); }} />
        </main>
        </>
    );
}

