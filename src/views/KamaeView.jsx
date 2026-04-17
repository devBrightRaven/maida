import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import FaceSwitchButton from '../ui/FaceSwitchButton';
import ShowcaseList from '../ui/features/Kamae/ShowcaseList';
import KamaeSearch from '../ui/features/Kamae/KamaeSearch';
import ExploreView from '../ui/features/Kamae/ExploreView';
import SettingsPanel from '../ui/features/Kamae/SettingsPanel';
import { resolveScrollTarget } from '../utils/scroll';
import KataPanel from '../ui/features/Kamae/KataPanel';
import GuidedTour from '../ui/features/GuidedTour/GuidedTour';
import { STEP } from '../tourSteps';
import { useGameInput } from '../hooks/useGameInput';
import { addGameToKata, removeGameFromKata } from '../core/katas';
import { t } from '../i18n';
import bridge from '../services/bridge';
import CalligraphyBg from '../ui/CalligraphyBg';
import Footer from '../ui/Footer';
import AccessibilityPage from '../ui/pages/AccessibilityPage';
import PrivacyPage from '../ui/pages/PrivacyPage';
import TermsPage from '../ui/pages/TermsPage';
import '../ui/features/GuidedTour/GuidedTour.css';
import './KamaeView.css';

/**
 * Kamae (構) — slow curation face.
 * Kata selector + game list + search + explore entry.
 */
export default function KamaeView({ onSwitchToRin, theme, toggleTheme, onLocaleChange, tourStep, tourTotal, onTourStart, onTourReplay, onTourClose, onTourAdvance, onTourPrev, settingsRequested, onSettingsOpened, themeToggle, onFrozenGuardChange, updateCheck, updateAlertShown }) {
    // SR guide announces once per install, gated by localStorage to avoid
    // re-announcement on every re-render / face switch. See RinView for same pattern.
    const [showSrGuide] = useState(() => localStorage.getItem('maida-hasHeardKamaeGuide') !== 'true');
    useEffect(() => {
        if (showSrGuide) {
            const t = setTimeout(() => localStorage.setItem('maida-hasHeardKamaeGuide', 'true'), 2000);
            return () => clearTimeout(t);
        }
    }, [showSrGuide]);
    const [showcaseState, setShowcaseState] = useState({ games: [] });
    const [allInstalledGames, setAllInstalledGames] = useState([]);
    const [gameMap, setGameMap] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [exploring, setExploring] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [expandedKataId, setExpandedKataId] = useState(null);
    const [legalPage, setLegalPage] = useState(null);
    const legalReturnRef = useRef(null);
    // SR hint when Escape/B first moves focus to back button (vs closing)
    const [backEscapeHint, setBackEscapeHint] = useState('');

    // Load showcase + all installed games on mount
    useEffect(() => {
        (async () => {
            const [data, gamesData] = await Promise.all([
                bridge.getShowcase(),
                bridge.getData('games'),
            ]);
            const state = data || { games: [] };
            setShowcaseState(state);

            if (gamesData?.games) {
                const installed = gamesData.games.filter(g => g.installed);
                setAllInstalledGames(installed);
                const map = new Map();
                installed.forEach(g => {
                    map.set(g.id, g);
                    if (g.steamAppId) map.set(g.steamAppId, g);
                });
                setGameMap(map);
            }

            setLoading(false);
        })();
    }, []);

    // Focus active kata/all-games on mount (after loading)
    useEffect(() => {
        if (loading) return;
        requestAnimationFrame(() => {
            const active = containerRef.current?.querySelector('.kata-group--active .kata-select-btn, [aria-pressed="true"]');
            if (active) active.focus();
        });
    }, [loading]);

    // Auto-open settings when requested via F10/Menu button
    useEffect(() => {
        if (settingsRequested && !loading) {
            setShowSettings(true);
            onSettingsOpened?.();
        }
    }, [settingsRequested, loading, onSettingsOpened]);

    const activeKataId = showcaseState.activeKataId || null;
    const activeKata = useMemo(() => {
        if (!activeKataId) return null;
        return (showcaseState.katas || []).find(k => k.id === activeKataId) || null;
    }, [activeKataId, showcaseState.katas]);

    const displayedGames = useMemo(() => {
        if (!activeKata) return allInstalledGames;
        return activeKata.gameIds.map(id => gameMap.get(id)).filter(Boolean);
    }, [activeKata, allInstalledGames, gameMap]);

    const activeKataGameIds = useMemo(() => {
        if (!activeKata) return null;
        return activeKata.gameIds;
    }, [activeKata]);

    const persistShowcase = useCallback(async (nextState) => {
        setShowcaseState(nextState);
        await bridge.saveShowcase(nextState);
    }, []);

    const handleAdd = useCallback(async (gameId) => {
        if (!activeKataId || !activeKata) return;
        const updated = addGameToKata(activeKata, gameId);
        if (updated === activeKata) return;
        const nextKatas = (showcaseState.katas || []).map(k =>
            k.id === activeKataId ? updated : k
        );
        await persistShowcase({ ...showcaseState, katas: nextKatas });
    }, [activeKataId, activeKata, showcaseState, persistShowcase]);

    const handleRemove = useCallback(async (gameId) => {
        if (!activeKataId || !activeKata) return;
        const updated = removeGameFromKata(activeKata, gameId);
        if (updated === activeKata) return;
        const nextKatas = (showcaseState.katas || []).map(k =>
            k.id === activeKataId ? updated : k
        );
        await persistShowcase({ ...showcaseState, katas: nextKatas });
    }, [activeKataId, activeKata, showcaseState, persistShowcase]);

    const handleKataUpdate = useCallback(async ({ katas, activeKataId: newActiveId }) => {
        const next = { ...showcaseState, katas, activeKataId: newActiveId };
        setShowcaseState(next);
        await bridge.saveShowcase(next);
    }, [showcaseState]);

    const containerRef = useRef(null);
    const kataPanelRef = useRef(null);
    const searchRef = useRef(null);
    const showcaseListRef = useRef(null);
    const faceSwitchRef = useRef(null);
    const replayTourBtnRef = useRef(null);
    const showTour = tourStep !== null && tourStep >= STEP.KAMAE_KATA && tourStep <= STEP.KAMAE_SWITCH_RIN;

    // Tour step KAMAE_SETTINGS_REPLAY highlights the Replay-tour button inside
    // Settings panel. Auto-open Settings on entering that step, auto-close on
    // advancing to the next step.
    useEffect(() => {
        if (tourStep === STEP.KAMAE_SETTINGS_REPLAY) setShowSettings(true);
        else if (tourStep === STEP.KAMAE_SWITCH_RIN) setShowSettings(false);
    }, [tourStep]);

    // D-pad navigation: cycle through all interactive elements.
    // Exceptions:
    //   - Legal page: up/down scroll the page (only the back button is
    //     focusable, so focus-cycle would be a no-op). R-stick is the
    //     primary scroll path; D-pad is a discrete fallback.
    //   - Range slider focused: left/right adjust the value (with
    //     auto-repeat from useGameInput's D-pad held-press handling),
    //     up/down fall through to focus-cycle so the user can exit
    //     the slider.
    const handleNav = useCallback((dir) => {
        if (legalPage && (dir === 'up' || dir === 'down')) {
            const target = resolveScrollTarget(document.activeElement);
            if (target) {
                target.scrollBy({ top: dir === 'up' ? -120 : 120, behavior: 'auto' });
            }
            return;
        }

        const active = document.activeElement;

        if (active?.tagName === 'INPUT' && active.type === 'range'
            && (dir === 'left' || dir === 'right')) {
            const step = Number(active.step) || 1;
            const min = active.min !== '' ? Number(active.min) : -Infinity;
            const max = active.max !== '' ? Number(active.max) : Infinity;
            const currentValue = Number(active.value);
            const nextValue = dir === 'left'
                ? Math.max(min, currentValue - step)
                : Math.min(max, currentValue + step);
            if (nextValue !== currentValue) {
                // React tracks native setter calls via a descriptor hook.
                // Direct `active.value = ...` would bypass React state, so
                // we use the prototype setter to ensure onChange fires.
                const setter = Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype, 'value'
                )?.set;
                if (setter) {
                    setter.call(active, String(nextValue));
                    active.dispatchEvent(new Event('input', { bubbles: true }));
                    active.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            return;
        }

        const container = containerRef.current;
        if (!container) return;
        const focusable = Array.from(container.querySelectorAll(
            'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"]), [role="button"], .showcase-item[tabindex]'
        ));
        if (focusable.length === 0) return;
        const current = focusable.indexOf(active);
        let next;
        if (dir === 'down' || dir === 'right') {
            next = current < focusable.length - 1 ? current + 1 : 0;
        } else {
            next = current > 0 ? current - 1 : focusable.length - 1;
        }
        focusable[next]?.focus();
        focusable[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [legalPage]);

    // A button: activate focused element (button click, checkbox toggle)
    const handleMainAction = useCallback(() => {
        const el = document.activeElement;
        if (!el) return;
        if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
            el.click();
        } else if (el.tagName === 'INPUT') {
            el.click();
        } else if (el.tagName === 'LABEL') {
            const cb = el.querySelector('input[type="checkbox"]');
            if (cb) cb.click();
        }
    }, []);

    const handleBack = useCallback(() => {
        if (legalPage) {
            // B/Escape on a legal page: scroll back into view, focus it,
            // and pulse it so users see the input was received even when
            // focus was already on the button. User confirms with Enter/A.
            const backBtn = document.querySelector('.legal-page-back');
            if (backBtn) {
                backBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                backBtn.focus();
                backBtn.classList.remove('legal-page-back--pulse');
                void backBtn.offsetWidth;
                backBtn.classList.add('legal-page-back--pulse');
                setTimeout(() => backBtn.classList.remove('legal-page-back--pulse'), 600);
            }
            return;
        }
        if (showSettings) {
            // B in settings: focus back button instead of immediately closing
            const backBtn = containerRef.current?.querySelector('.kamae-settings-back-btn');
            if (backBtn && document.activeElement !== backBtn) {
                backBtn.focus();
                setBackEscapeHint(t('ui.status.back_focused'));
                // Clear hint after a moment so repeated Escape doesn't re-announce stale text
                setTimeout(() => setBackEscapeHint(''), 2500);
                return;
            }
            setBackEscapeHint('');
            setShowSettings(false);
        } else if (exploring) {
            setExploring(false);
        } else if (expandedKataId) {
            setExpandedKataId(null);
        } else {
            // Focus the active kata row or all-games button
            const container = containerRef.current;
            if (container) {
                const active = container.querySelector('.kata-group--active .kata-select-btn, [aria-pressed="true"]');
                if (active) active.focus();
            }
        }
    }, [legalPage, showSettings, exploring, expandedKataId]);

    // F1 opens Kamae tour
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'F1' && !showTour && !showSettings && !exploring) {
                e.preventDefault();
                onTourStart();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [showTour, showSettings, exploring, onTourStart]);

    useGameInput({
        onBack: handleBack,
        onNav: handleNav,
        onMainAction: handleMainAction,
        onYButton: useCallback(() => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'F2', bubbles: true })
            );
        }, []),
    });

    if (loading) {
        return (
            <main className="kamae-view" ref={containerRef}>
                <div className="kamae-content">
                    <p className="kamae-loading" role="status" aria-live="polite">{t('ui.status.loading')}</p>
                </div>
            </main>
        );
    }

    if (showSettings) {
        return (
            <main className="kamae-view" ref={containerRef}>
                <p className="sr-only" role="status" aria-live="polite">{backEscapeHint}</p>
                <div className="kamae-content">
                    <SettingsPanel
                        onClose={() => setShowSettings(false)}
                        theme={theme}
                        toggleTheme={toggleTheme}
                        onLocaleChange={onLocaleChange}
                        onTourStart={onTourReplay}
                        onNavigateLegal={(page) => { legalReturnRef.current = document.activeElement; setLegalPage(page); }}
                        replayTourBtnRef={replayTourBtnRef}
                        updateCheck={updateCheck}
                        updateAlertShown={updateAlertShown}
                        onFrozenGuardChange={onFrozenGuardChange}
                    />
                </div>
                {/* Tour step 8 highlights the Replay-tour button inside Settings.
                    Standalone GuidedTour rendered here because main render path
                    is replaced by SettingsPanel. */}
                {showTour && tourStep === STEP.KAMAE_SETTINGS_REPLAY && (
                    <GuidedTour
                        steps={[{ targetRef: replayTourBtnRef, text: t('ui.tour.step_settings_replay') }]}
                        localIndex={0}
                        globalIndex={tourStep}
                        totalSteps={tourTotal}
                        onClose={onTourClose}
                        onAdvance={onTourAdvance}
                        onPrev={onTourPrev}
                    />
                )}
            </main>
        );
    }

    if (legalPage) {
        const pages = {
            accessibility: AccessibilityPage,
            privacy: PrivacyPage,
            terms: TermsPage,
        };
        const Page = pages[legalPage];
        return Page ? <Page onClose={() => { setLegalPage(null); requestAnimationFrame(() => legalReturnRef.current?.focus()); }} /> : null;
    }

    if (exploring) {
        return (
            <main className="kamae-view kamae-view--explore" ref={containerRef}>
                <ExploreView
                    allInstalledGames={allInstalledGames}
                    katas={showcaseState.katas || []}
                    onAddToKata={handleAdd}
                    onBack={() => setExploring(false)}
                    exploreHistory={showcaseState.exploreHistory}
                    onExploreHistoryUpdate={async (history) => {
                        const next = { ...showcaseState, exploreHistory: history };
                        setShowcaseState(next);
                        await bridge.saveShowcase(next);
                    }}
                />
            </main>
        );
    }

    return (
        <main className="kamae-view" ref={containerRef}>
            {showSrGuide && (
                <p className="sr-only" role="status" aria-live="polite">{t('ui.kamae.sr_guide')}</p>
            )}
            <CalligraphyBg char="構" className="kamae-calligraphy-bg" />
            <div className="kamae-title-block" aria-hidden="true">
                <p className="kamae-title-reading">{t('ui.kamae.reading')}</p>
                <p className="kamae-title-desc">{t('ui.kamae.desc')}</p>
            </div>
            <div className="kamae-content">
                <h1 className="sr-only">{t('ui.kamae.mode_prefix')}構 Kamae</h1>
                <button
                    type="button"
                    className={`kata-item ${activeKataId === null ? 'kata-item--active' : ''}`}
                    aria-pressed={activeKataId === null}
                    onClick={() => handleKataUpdate({ katas: showcaseState.katas || [], activeKataId: null })}
                >
                    <span className="kata-item-name">
                        {t('ui.katas.all_games')}
                        <span className="kata-item-count" aria-hidden="true">({allInstalledGames.length})</span>
                        <span className="sr-only">, {t('ui.katas.game_count_aria', { count: allInstalledGames.length })}</span>
                    </span>
                    <span className={`kata-item-badge ${activeKataId === null ? '' : 'kata-item-badge--hidden'}`}>{t('ui.katas.active')}</span>
                    <span className="kata-item-actions kata-item-actions--placeholder" />
                </button>
                <div ref={kataPanelRef}>
                    <KataPanel
                        katas={showcaseState.katas || []}
                        activeKataId={activeKataId}
                        showcaseGames={allInstalledGames}
                        onUpdate={handleKataUpdate}
                        expandedId={expandedKataId}
                        onExpandToggle={setExpandedKataId}
                    />
                </div>
                <div ref={searchRef}>
                    <KamaeSearch
                        activeKataGameIds={activeKataGameIds}
                        activeKataName={activeKata ? activeKata.name : null}
                        onAdd={handleAdd}
                    />
                </div>
                <div ref={showcaseListRef}>
                    <ShowcaseList
                        games={displayedGames}
                        onRemove={handleRemove}
                        isKataMode={activeKata !== null}
                    />
                </div>
                {/* Explore hidden for v0.1.0 — kata search replaces it */}
                {false && activeKataId && (
                    <button
                        type="button"
                        className="kamae-explore-btn"
                        onClick={() => setExploring(true)}
                    >
                        {t('ui.kamae.explore_more')}
                    </button>
                )}
                <button
                    type="button"
                    className="kamae-settings-link"
                    onClick={() => setShowSettings(true)}
                >
                    {t('ui.settings.title')} <span className="kamae-settings-shortcut">(F10 / Menu)</span>
                </button>
                {/* Face switch + Help + Theme placed inside .kamae-content,
                    BEFORE Footer, so Tab order matches Rin: ... → face → help
                    → theme → footer. Both buttons are absolute-positioned via
                    CSS so visual layout is unchanged by DOM placement. */}
                <FaceSwitchButton ref={faceSwitchRef} direction="to-rin" onClick={onSwitchToRin} />
                <button
                    className="help-tour-btn"
                    aria-label={t('ui.tour.help_aria')}
                    data-tooltip={t('ui.tour.help_tooltip')}
                    onClick={onTourStart}
                >
                    ?
                </button>
                {themeToggle}
                <Footer onNavigate={(page) => { legalReturnRef.current = document.activeElement; setLegalPage(page); }} />
            </div>

            {/* Tour main render covers steps 5,6,7,9. Step 8 (Settings replay)
                is rendered in the showSettings branch above because Settings
                replaces this main view entirely. */}
            {showTour && tourStep !== STEP.KAMAE_SETTINGS_REPLAY && (() => {
                const kamaeSteps = [
                    { targetRef: kataPanelRef, text: t('ui.tour.step_kata') },
                    { targetRef: searchRef, text: activeKata ? t('ui.tour.step_search') : t('ui.tour.step_search_no_kata') },
                    { targetRef: showcaseListRef, text: activeKata ? t('ui.tour.step_list_kata') : t('ui.tour.step_list_no_kata') },
                    { targetRef: faceSwitchRef, text: t('ui.tour.step_switch_rin'), interactive: true },
                ];
                // Kamae sub-tour local index (step KAMAE_SETTINGS_REPLAY is
                // rendered in the showSettings branch above and skipped here).
                const localIndex = tourStep === STEP.KAMAE_SWITCH_RIN ? 3 : tourStep - STEP.KAMAE_KATA;
                return (
                    <GuidedTour
                        steps={kamaeSteps}
                        localIndex={localIndex}
                        globalIndex={tourStep}
                        totalSteps={tourTotal}
                        onClose={onTourClose}
                        onAdvance={onTourAdvance}
                        onPrev={onTourPrev}
                    />
                );
            })()}
        </main>
    );
}
