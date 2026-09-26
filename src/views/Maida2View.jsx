import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { bucketGames } from '../core/zones';
import { lastPlayedState, formatLastPlayed } from '../core/lastPlayed';
import { useGameInput } from '../hooks/useGameInput';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { vibrate, vibrateProgress } from '../services/haptics';
import { t, getLocale } from '../i18n';
import bridge from '../services/bridge';
import Footer from '../ui/Footer';
import CardMedia from '../ui/features/Maida2/CardMedia';
import './Maida2View.css';

// Red line 7.4 — friction thresholds, do not change.
const TAP_THRESHOLD = 300;
const HOLD_THRESHOLD = 3000;

// Local Steam capsule art cache (steamAppId -> Promise|dataUrl|null). The
// in-flight Promise is stored immediately at fetch start (dedupes concurrent
// fetches for the same appId), then replaced by its resolved value. Module-
// level so every card fetches its art at most once per app run, not once per
// mount/re-render.
const capsuleCache = new Map();

// Resolved (non-Promise) cache read, for synchronous render use — a pending
// fetch must render as "no art yet", not as a broken <img src={Promise}>.
function resolvedArt(cache, appId) {
    const v = cache.get(appId);
    return typeof v === 'string' ? v : null;
}

// Focus-dwell hero backdrop cache (steamAppId -> Promise|dataUrl|null; same
// in-flight-then-resolved convention as capsuleCache). Hero files run larger
// than capsules (~200KB+), so this one is capped: oldest-inserted entry
// evicted once the cap is exceeded (Map preserves insertion order — re-set on
// an existing key does not move it, so replacing a Promise with its resolved
// value keeps FIFO order intact).
const heroCache = new Map();
const HERO_CACHE_LIMIT = 8;
function cacheHero(appId, dataUrl) {
    heroCache.set(appId, dataUrl);
    if (heroCache.size > HERO_CACHE_LIMIT) {
        heroCache.delete(heroCache.keys().next().value);
    }
}

const HERO_DWELL_MS = 400;

// Hover-dwell focus: the only safe mouse "select without launching" path
// (click = tap = launch on these cards). A 1s hover moves real DOM focus
// onto the card, which then drives the existing focus-dwell/expand/play
// chain unchanged — no separate hover-only behavior to maintain.
const HOVER_FOCUS_MS = 1000;

// "All installed" mixes recorded, zero, and unknown games, unlike a single
// zone. Routes through lastPlayedState (core/lastPlayed.js) so missing /
// invalid / legacy games are never shown as "never played" — see the
// LastPlayed data contract (P0-1).
function lastPlayedSubline(game) {
    const state = lastPlayedState(game);
    if (state.kind === 'recorded') return formatLastPlayed(state.epoch, getLocale());
    if (state.kind === 'zero') return t('ui.maida2.card_no_play_record');
    return t('ui.maida2.card_play_record_unavailable');
}

/**
 * Maida2View — three fixed zones (NOW / STILL HERE / RECENTLY ARRIVED).
 * Zone order is fixed; within-zone sort is observable facts only (zones.js).
 * Accessibility shell cloned from KamaeView; per-card hold cloned from
 * RinView's visit-button wiring (pointer events + Enter keydown/keyup).
 */
export default function Maida2View({ navigation, games, hooksState, onHookAction, onLaunch, onHistory, themeToggle, footerVersion, onNavigateLegal, playDelaySeconds = 3, previewAudio = true, cardOpacity = 70 }) {
    const prefersReducedMotion = usePrefersReducedMotion();
    // SR guide announces once per install, gated by localStorage to avoid
    // re-announcement on every re-render / face switch. See KamaeView.
    const [showSrGuide] = useState(() => localStorage.getItem('maida-hasHeardMaida2Guide') !== 'true');
    useEffect(() => {
        if (showSrGuide) {
            const timer = setTimeout(() => localStorage.setItem('maida-hasHeardMaida2Guide', 'true'), 2000);
            return () => clearTimeout(timer);
        }
    }, [showSrGuide]);

    const containerRef = useRef(null);
    const zones = useMemo(() => bucketGames({ games, hooksState }), [games, hooksState]);
    const gameStates = hooksState?.gameStates || {};
    const hookedIds = useMemo(
        () => new Set((hooksState?.hooks || []).filter(h => h?.status === 'active').map(h => h.gameId)),
        [hooksState]
    );

    // "All installed" — every installed game regardless of zone membership or
    // rest/released state. Collapsed by default; expanded on demand so the
    // D-pad focus cycle stays short until the user asks for the full list.
    const [allOpen, setAllOpen] = useState(false);
    const allInstalled = useMemo(
        () => (games || [])
            .filter(g => g && g.installed)
            .sort((a, b) => {
                const aState = lastPlayedState(a);
                const bState = lastPlayedState(b);
                const aEpoch = aState.kind === 'recorded' ? aState.epoch : 0;
                const bEpoch = bState.kind === 'recorded' ? bState.epoch : 0;
                return (bEpoch - aEpoch) || String(a.title || '').localeCompare(String(b.title || ''));
            }),
        [games]
    );

    // Fetch local Steam capsule art for every card currently visible across
    // the three zones. capsuleCache guards against re-fetching an appid
    // already resolved this app run; artTick forces a re-render once art
    // for a previously-uncached appid comes back.
    const [, setArtTick] = useState(0);
    useEffect(() => {
        const ids = new Set();
        zones.now.forEach(g => g.steamAppId && ids.add(g.steamAppId));
        zones.recentlyArrived.forEach(g => g.steamAppId && ids.add(g.steamAppId));
        zones.stillHere.forEach(({ game }) => game.steamAppId && ids.add(game.steamAppId));
        // Only fetch for the "All installed" list once expanded — collapsed,
        // its 84-ish cards stay unmounted and unfetched.
        if (allOpen) allInstalled.forEach(g => g.steamAppId && ids.add(g.steamAppId));
        const missing = [...ids].filter(id => !capsuleCache.has(id));
        if (missing.length === 0) return;

        let cancelled = false;
        // Store each in-flight Promise immediately (synchronously, before any
        // await) so a concurrent effect re-run or StrictMode double-mount
        // sees capsuleCache.has(id) true and never re-invokes the same fetch.
        missing.forEach(appId => {
            const promise = bridge.getArt(appId, 'capsule');
            capsuleCache.set(appId, promise);
            promise.then(dataUrl => {
                capsuleCache.set(appId, dataUrl);
                if (!cancelled) setArtTick(n => n + 1);
            });
        });
        return () => { cancelled = true; };
    }, [zones, allOpen, allInstalled]);

    // Localized Steam titles for every installed game, current locale. Kept
    // in component (not module) state — App.jsx remounts this whole view on
    // locale change (key={localeVersion}), so a fresh fetch on mount already
    // covers a locale switch; the games-list dependency covers new installs.
    // A missing entry (appId not in the map) means "no localized name" and
    // the caller falls back to game.title.
    const [localizedTitles, setLocalizedTitles] = useState({});
    useEffect(() => {
        const appIds = [...new Set((games || [])
            .filter(g => g && g.installed && g.steamAppId)
            .map(g => g.steamAppId))];
        if (appIds.length === 0) { setLocalizedTitles({}); return; }
        let cancelled = false;
        bridge.getLocalizedTitles(appIds, getLocale()).then(map => {
            if (!cancelled) setLocalizedTitles(map || {});
        });
        return () => { cancelled = true; };
    }, [games]);
    const displayTitle = useCallback(
        (game) => localizedTitles[game.steamAppId] ?? game.title,
        [localizedTitles]
    );

    // Focus-dwell hero backdrop: a card holding focus for HERO_DWELL_MS
    // fetches its hero banner and shows it as an ambient background. Timer
    // resets on every focus change (handleCardFocus). Last shown hero is
    // kept until a different card actually dwells — no art for the newly
    // focused card is not a reason to clear what's already showing.
    const [heroUrl, setHeroUrl] = useState(null);
    const dwellTimerRef = useRef(null);
    // Generation guard: bumped on every focus change. A dwell timer's async
    // fetch only applies its result if it's still the latest focus and the
    // view is still mounted — otherwise a stale response could overwrite a
    // newer hero (or fire setState after unmount).
    const focusGenRef = useRef(0);
    const isMountedRef = useRef(true);

    // Focus-dwell card expansion: same dwell timer as the hero backdrop
    // above. expandedKey is the per-card key ('zone:<id>' / 'hook:<id>',
    // matching holdKeyRef's convention so a hooked game shown in both NOW
    // and STILL HERE doesn't expand both at once) of the currently-open
    // card. focusedCardKeyRef tracks which card genuinely still holds focus,
    // so a dwell timer that was already in flight when focus left doesn't
    // re-open a card after the user has moved on.
    const [expandedKey, setExpandedKey] = useState(null);
    const focusedCardKeyRef = useRef(null);

    // Dwell-to-play: once a card has been open for playDelaySeconds, it
    // becomes eligible to show a video/slideshow preview (CardMedia mounts
    // only while playFor.key matches that card — unmounting IS the stop
    // signal, see CardMedia's own cleanup). { key, appId } rather than a
    // bare key so the render path doesn't need to re-derive appId from key.
    const [playFor, setPlayFor] = useState(null);
    const playTimerRef = useRef(null);
    const playDelayMs = playDelaySeconds * 1000;

    const handleCardFocus = useCallback((appId, cardKey) => {
        if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
        if (playTimerRef.current) clearTimeout(playTimerRef.current);
        const gen = ++focusGenRef.current;
        focusedCardKeyRef.current = cardKey ?? null;
        // Collapse whatever was expanded the moment focus lands on a
        // different card — expansion itself still waits for the dwell.
        setExpandedKey(prev => (prev === cardKey ? prev : null));
        setPlayFor(prev => (prev?.key === cardKey ? prev : null));
        if (!appId) return;
        dwellTimerRef.current = setTimeout(async () => {
            if (isMountedRef.current && focusGenRef.current === gen && focusedCardKeyRef.current === cardKey) {
                setExpandedKey(cardKey);
                // Second, longer timer chained off the card actually being
                // open — matches the design: dwell opens the card, THEN a
                // further playDelaySeconds before a preview starts playing.
                playTimerRef.current = setTimeout(() => {
                    if (isMountedRef.current && focusGenRef.current === gen && focusedCardKeyRef.current === cardKey) {
                        setPlayFor({ key: cardKey, appId });
                    }
                }, playDelayMs);
            }
            if (!heroCache.has(appId)) {
                // Store the in-flight Promise immediately: a repeated dwell
                // on the same appId, or a concurrent StrictMode re-run,
                // awaits this same fetch instead of invoking it again.
                cacheHero(appId, bridge.getArt(appId, 'hero'));
            }
            const cached = heroCache.get(appId);
            const dataUrl = await Promise.resolve(cached);
            if (dataUrl !== cached) cacheHero(appId, dataUrl);
            if (!isMountedRef.current || focusGenRef.current !== gen) return;
            if (dataUrl) setHeroUrl(dataUrl);
        }, HERO_DWELL_MS);
    }, [playDelayMs]);

    // Blur to something that isn't any card (footer, theme toggle, nav away
    // entirely) collapses immediately. Blur to another card is handled by
    // that card's own onFocus above, not here.
    const handleCardBlur = useCallback((e) => {
        const related = e.relatedTarget;
        if (related && related.closest && related.closest('.m2-card')) return;
        if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
        if (playTimerRef.current) clearTimeout(playTimerRef.current);
        focusedCardKeyRef.current = null;
        setExpandedKey(null);
        setPlayFor(null);
    }, []);

    // Keep the newly-grown card fully in view once its dwell timer opens it.
    useEffect(() => {
        if (!expandedKey) return;
        document.activeElement?.scrollIntoView({ block: 'nearest' });
    }, [expandedKey]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
            if (playTimerRef.current) clearTimeout(playTimerRef.current);
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        };
    }, []);

    // ── Shared polite status for hook/state changes ('' then text so
    //    repeated identical announcements still fire) ──
    const [statusMsg, setStatusMsg] = useState('');
    const announce = useCallback((text) => {
        setStatusMsg('');
        requestAnimationFrame(() => setStatusMsg(text));
    }, []);

    // ── Per-card long-press engine (RinView pattern; one hold at a time) ──
    const [holdProgress, setHoldProgress] = useState(0);
    const [holdAnnounce, setHoldAnnounce] = useState('');
    const holdStart = useRef(null);
    const holdFrame = useRef(null);
    const holdTriggered = useRef(false);
    const holdGameRef = useRef(null);
    // Per-CARD key ('zone:<gameId>' / 'hook:<hookId>'): a hooked game can sit
    // in NOW and STILL HERE at once, so game.id alone would render the hold
    // progress and the note editor under both cards.
    const holdKeyRef = useRef(null);
    const lastHaptic = useRef(0);

    // Inline hook-note editor (opened by a completed hold): { game, key }
    const [noteFor, setNoteFor] = useState(null);
    const [note, setNote] = useState('');
    const [hookBusy, setHookBusy] = useState(false);
    const [hookError, setHookError] = useState('');
    const hookBusyRef = useRef(false);
    const noteInputRef = useRef(null);

    const resetHold = useCallback(() => {
        holdStart.current = null;
        holdTriggered.current = false;
        setHoldProgress(0);
        if (holdFrame.current) {
            cancelAnimationFrame(holdFrame.current);
            holdFrame.current = null;
        }
    }, []);

    const animateHold = useCallback(() => {
        if (hookBusyRef.current) {
            resetHold();
            return;
        }
        if (!holdStart.current) return;
        const elapsed = Date.now() - holdStart.current;
        const progress = Math.min(elapsed / HOLD_THRESHOLD, 1);
        setHoldProgress(progress);
        if (progress < 1) {
            const now = Date.now();
            if (now - lastHaptic.current >= 400) {
                vibrateProgress(progress);
                lastHaptic.current = now;
            }
            holdFrame.current = requestAnimationFrame(animateHold);
        } else {
            holdTriggered.current = true;
            vibrate('strong');
            const game = holdGameRef.current;
            const key = holdKeyRef.current;
            resetHold();
            setNoteFor({ game, key });
            setNote('');
        }
    }, [resetHold]);

    const pressStart = useCallback((game, key) => {
        if (hookBusyRef.current || holdStart.current) return;
        holdStart.current = Date.now();
        lastHaptic.current = Date.now();
        holdGameRef.current = game;
        holdKeyRef.current = key;
        vibrate('confirm');
        holdFrame.current = requestAnimationFrame(animateHold);
    }, [animateHold]);

    const pressEnd = useCallback(() => {
        if (hookBusyRef.current) {
            resetHold();
            return;
        }
        if (!holdStart.current) return;
        const elapsed = Date.now() - holdStart.current;
        const game = holdGameRef.current;
        const triggered = holdTriggered.current;
        resetHold();
        if (!triggered && elapsed <= TAP_THRESHOLD) onLaunch(game);
    }, [resetHold, onLaunch]);

    const pressCancel = useCallback(() => {
        if (holdStart.current || holdFrame.current) resetHold();
    }, [resetHold]);

    // Hover-dwell focus: entering a card starts a timer; if the pointer is
    // still there when it fires, and nothing else claims input focus right
    // now, move real focus onto the card (captured via currentTarget before
    // the timeout, not re-read from the event after it's gone stale).
    // Deliberately NOT gated on document.hasFocus(): DOM focus inside an
    // inactive window steals nothing from the OS, and a window launched
    // from the Start Menu is routinely still inactive when the mouse first
    // reaches it. What an inactive window must not do is make noise —
    // that's windowFocused below, which only governs preview audio.
    const hoverTimerRef = useRef(null);
    const handleCardMouseEnter = useCallback((e) => {
        const el = e.currentTarget;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            hoverTimerRef.current = null;
            const active = document.activeElement;
            const activeTag = active?.tagName;
            const inputFocused = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
            const noteEditorOpen = document.querySelector('.m2-note-editor');
            if (!noteEditorOpen && !inputFocused) {
                el.focus();
            }
        }, HOVER_FOCUS_MS);
    }, []);

    // Preview audio follows OS window focus: a background window may show
    // a silent preview, never a loud one. Unmutes live when the window is
    // activated (CardMedia's muted prop tracks this).
    const [windowFocused, setWindowFocused] = useState(() => document.hasFocus());
    useEffect(() => {
        const onFocus = () => setWindowFocused(true);
        const onBlur = () => setWindowFocused(false);
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
        };
    }, []);
    const handleCardMouseLeave = useCallback(() => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    }, []);

    // Hold milestone -> SR announcement (set on threshold crossings only,
    // so NVDA is not interrupted continuously). Completion is announced by
    // focus moving to the labeled note input.
    useEffect(() => {
        if (holdProgress === 0) { setHoldAnnounce(''); return; }
        if (holdProgress >= 0.95) setHoldAnnounce(t('ui.status.anchoring_near'));
        else if (holdProgress >= 0.5) setHoldAnnounce(t('ui.status.anchoring_mid'));
    }, [holdProgress]);

    useEffect(() => {
        if (noteFor) requestAnimationFrame(() => noteInputRef.current?.focus());
    }, [noteFor]);

    useEffect(() => () => resetHold(), [resetHold]);

    // ── Focus management ──
    const focusPrimary = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const primary = container.querySelector('.m2-card')
            || container.querySelector('.mode-navigation button')
            || container.querySelector('.theme-toggle');
        primary?.focus();
    }, []);

    const focusCard = useCallback((gameId) => {
        const card = containerRef.current?.querySelector(`.m2-card[data-game-id="${gameId}"]`);
        if (card) card.focus();
        else focusPrimary();
    }, [focusPrimary]);

    // Mount focus
    useEffect(() => {
        requestAnimationFrame(() => focusPrimary());
    }, [focusPrimary]);

    const confirmNote = useCallback(async () => {
        if (!noteFor || hookBusyRef.current) return;
        const trimmed = note.trim();
        if (!trimmed) {
            // createHook no-ops on an empty note: keep the editor open and ask
            // for a few words instead of falsely announcing "intent kept".
            announce(t('ui.maida2.hook_note_required'));
            return;
        }
        const game = noteFor.game;
        setHookError('');
        hookBusyRef.current = true;
        setHookBusy(true);
        try {
            const result = await onHookAction({ type: 'create', gameId: game.id, note: trimmed, title: game.title });
            if (result == null) {
                setHookError(t('ui.history.save_error'));
                return;
            }
            setNoteFor(null);
            setNote('');
            announce(t('ui.maida2.hook_created_status'));
            requestAnimationFrame(() => focusCard(game.id));
        } catch {
            setHookError(t('ui.history.save_error'));
        } finally {
            hookBusyRef.current = false;
            setHookBusy(false);
        }
    }, [noteFor, note, onHookAction, announce, focusCard]);

    const cancelNote = useCallback(() => {
        if (!noteFor || hookBusyRef.current) return;
        const gameId = noteFor.game.id;
        setHookError('');
        setNoteFor(null);
        setNote('');
        requestAnimationFrame(() => focusCard(gameId));
    }, [noteFor, focusCard]);

    const handleRetract = useCallback(async (hook) => {
        if (hookBusyRef.current) return;
        setHookError('');
        hookBusyRef.current = true;
        setHookBusy(true);
        try {
            const result = await onHookAction({ type: 'retract', hookId: hook.id });
            if (result == null) {
                setHookError(t('ui.history.save_error'));
                return;
            }
            announce(t('ui.maida2.hook_retracted_status'));
            requestAnimationFrame(() => focusPrimary());
        } catch {
            setHookError(t('ui.history.save_error'));
        } finally {
            hookBusyRef.current = false;
            setHookBusy(false);
        }
    }, [onHookAction, announce, focusPrimary]);

    const handleSetState = useCallback(async (gameId, state) => {
        if (hookBusyRef.current) return;
        setHookError('');
        hookBusyRef.current = true;
        setHookBusy(true);
        try {
            const result = await onHookAction({ type: 'setState', gameId, state });
            if (result == null) {
                setHookError(t('ui.history.save_error'));
                return;
            }
            announce(t('ui.maida2.state_set_status', { state: t(`ui.maida2.state_${state}`) }));
        } catch {
            setHookError(t('ui.history.save_error'));
        } finally {
            hookBusyRef.current = false;
            setHookBusy(false);
        }
    }, [onHookAction, announce]);

    // D-pad navigation: cycle through interactive elements, KamaeView shape.
    // theme (+ help when present) pulled front, update button (app-root
    // sibling — red line 7.11) inserted before footer.
    const handleNav = useCallback((dir) => {
        const container = containerRef.current;
        if (!container) return;
        const all = Array.from(container.querySelectorAll(
            'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"]), [role="button"]'
        ));
        const theme = all.find(el => el.classList.contains('theme-toggle'));
        const help = all.find(el => el.classList.contains('help-tour-btn'));
        const footerSet = new Set(Array.from(container.querySelectorAll('.app-footer button')));
        const footerBtns = all.filter(el => footerSet.has(el));
        const rest = all.filter(el => el !== theme && el !== help && !footerSet.has(el));
        const focusable = [
            ...(theme ? [theme] : []),
            ...(help ? [help] : []),
            ...rest,
            ...footerBtns
        ];
        if (focusable.length === 0) return;
        const current = focusable.indexOf(document.activeElement);
        let next;
        if (dir === 'down' || dir === 'right') {
            next = current < focusable.length - 1 ? current + 1 : 0;
        } else {
            next = current > 0 ? current - 1 : focusable.length - 1;
        }
        focusable[next]?.focus();
        focusable[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, []);

    // A button: activate focused element (m2-hold cards get PointerEvents
    // from useGameInput's whitelist instead of reaching this path)
    const handleMainAction = useCallback(() => {
        const el = document.activeElement;
        if (!el) return;
        if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
            el.click();
        } else if (el.tagName === 'INPUT') {
            el.click();
        }
    }, []);

    // B: close the note editor if open, otherwise return focus to primary
    const handleBack = useCallback(() => {
        if (hookBusyRef.current) return;
        if (noteFor) {
            cancelNote();
            return;
        }
        focusPrimary();
    }, [noteFor, cancelNote, focusPrimary]);

    useGameInput({
        onBack: handleBack,
        onNav: handleNav,
        onMainAction: handleMainAction,
    });

    const renderNoteEditor = () => (
        <div className="m2-note-editor">
            <label className="m2-note-label" htmlFor="m2-note-input">{t('ui.maida2.hook_note_label')}</label>
            <input
                id="m2-note-input"
                ref={noteInputRef}
                className="m2-note-input"
                type="text"
                value={note}
                disabled={hookBusy}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                    // e.repeat guard: the Enter still held from the 3s hold
                    // auto-repeats into this input once focus lands here.
                    if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); confirmNote(); }
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelNote(); }
                }}
            />
            <button type="button" className="m2-note-confirm" onClick={confirmNote} disabled={hookBusy}>
                {t('ui.settings.save')}
            </button>
        </div>
    );

    // NOW / RECENTLY ARRIVED card: tap <= 300ms launches, hold 3s opens the
    // hook-note editor. Wiring cloned from RinView's visit button; the
    // 'm2-hold' class routes gamepad A through PointerEvents (useGameInput).
    const renderHoldCard = (game, subline, keyPrefix = 'zone') => {
        const cardKey = `${keyPrefix}:${game.id}`;
        const expandArt = resolvedArt(heroCache, game.steamAppId) || resolvedArt(capsuleCache, game.steamAppId);
        return (
            <li key={game.id} className="m2-item">
                <button
                    type="button"
                    className={`m2-card m2-hold${expandedKey === cardKey ? ' m2-card--expanded' : ''}`}
                    data-game-id={game.id}
                    disabled={hookBusy}
                    aria-describedby="m2-hold-hint"
                    onPointerDown={() => pressStart(game, cardKey)}
                    onPointerUp={pressEnd}
                    onPointerLeave={pressCancel}
                    onPointerCancel={pressCancel}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); pressStart(game, cardKey); } }}
                    onKeyUp={(e) => { if (e.key === 'Enter') { e.preventDefault(); pressEnd(); } }}
                    onClick={(e) => { e.stopPropagation(); }}
                    onFocus={() => handleCardFocus(game.steamAppId, cardKey)}
                    onBlur={handleCardBlur}
                    onMouseEnter={handleCardMouseEnter}
                    onMouseLeave={handleCardMouseLeave}
                >
                    <span className="m2-card-row">
                        {resolvedArt(capsuleCache, game.steamAppId) && (
                            <img className="m2-card-art" alt="" aria-hidden="true" draggable={false} src={resolvedArt(capsuleCache, game.steamAppId)} />
                        )}
                        <span className="m2-card-body">
                            <span className="m2-card-title">{displayTitle(game)}</span>
                            <span className="m2-card-sub">{subline}</span>
                            {hookedIds.has(game.id) && (
                                <span className="m2-card-badge">{t('ui.maida2.card_hooked_badge')}</span>
                            )}
                        </span>
                    </span>
                    {expandArt && (
                        <div
                            className={`m2-card-expand${expandedKey === cardKey ? ' m2-card-expand--open' : ''}`}
                            aria-hidden="true"
                            style={{ backgroundImage: `url(${expandArt})` }}
                        />
                    )}
                    {holdKeyRef.current === cardKey && holdProgress > 0 && (
                        <div
                            className="m2-card-progress"
                            role="progressbar"
                            aria-valuenow={Math.round(holdProgress * 100)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={t('ui.maida2.hook_hold_hint')}
                            style={{ width: `${holdProgress * 100}%` }}
                        ></div>
                    )}
                </button>
                {noteFor?.key === cardKey && renderNoteEditor()}
            </li>
        );
    };

    return (
        <main
            className={`maida2-view${playFor ? ' maida2-view--playing' : ''}`}
            ref={containerRef}
            style={{ '--m2-card-alpha': cardOpacity }}
            aria-busy={hookBusy}
        >
            {/* Ambient focus-dwell hero backdrop — purely decorative, never
                the accessible name/description of anything. CSS background-
                image (not <img>) so there's no alt text to get wrong. */}
            <div
                className={`m2-hero-backdrop${heroUrl && !playFor ? ' m2-hero-backdrop--visible' : ''}`}
                aria-hidden="true"
                style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}
            />
            {/* Full-window media backdrop — plays behind the frosted-glass
                cards, not a fullscreen takeover. Decorative only (aria-hidden);
                CardMedia's own reducedMotion check keeps it from autoplaying. */}
            {playFor && (
                <div className="m2-backdrop-media" aria-hidden="true">
                    <CardMedia appId={playFor.appId} reducedMotion={prefersReducedMotion} audioEnabled={previewAudio && windowFocused} />
                </div>
            )}
            {showSrGuide && (
                <p className="sr-only" role="status" aria-live="polite">{t('ui.maida2.sr_guide')}</p>
            )}
            {/* Hold milestone announcements — one polite region, text changes
                only at 50/95 so NVDA is not interrupted continuously. */}
            <p className="sr-only" role="status" aria-live="polite">{holdAnnounce}</p>
            {/* Shared polite status for hook/state changes */}
            <p className="sr-only" role="status" aria-live="polite">{statusMsg}</p>
            {hookError && <p className="m2-save-error" role="alert">{hookError}</p>}
            <h1 className="sr-only">{t('ui.maida2.title')}</h1>
            <p id="m2-hold-hint" className="sr-only">
                {t('ui.maida2.launch_hint')} {t('ui.maida2.hook_hold_hint')}
            </p>
            {navigation}
            <div className="maida2-content">
                <section className="m2-zone" aria-labelledby="m2-zone-now">
                    <h2 id="m2-zone-now" className="m2-zone-title">{t('ui.maida2.zone_now')}</h2>
                    {zones.now.length === 0 ? (
                        <p className="m2-zone-empty">{t('ui.maida2.zone_now_empty')}</p>
                    ) : (
                        <ul role="list" className="m2-list">
                            {zones.now.map(game =>
                                renderHoldCard(game, lastPlayedSubline(game)))}
                        </ul>
                    )}
                </section>

                <section className="m2-zone" aria-labelledby="m2-zone-still-here">
                    <h2 id="m2-zone-still-here" className="m2-zone-title">{t('ui.maida2.zone_still_here')}</h2>
                    {zones.stillHere.length === 0 ? (
                        <p className="m2-zone-empty">{t('ui.maida2.zone_still_here_empty')}</p>
                    ) : (
                        <ul role="list" className="m2-list">
                            {zones.stillHere.map(({ hook, game }) => {
                                const cardKey = `hook:${hook.id}`;
                                const expandArt = resolvedArt(heroCache, game.steamAppId) || resolvedArt(capsuleCache, game.steamAppId);
                                return (
                                <li key={hook.id} className="m2-item">
                                    {/* Same press engine as renderHoldCard — a bare
                                        onClick would let NVDA browse-mode Space launch
                                        via synthetic click (red line 7.3). The m2-hold
                                        class routes gamepad A through PointerEvents. */}
                                    <button
                                        type="button"
                                        className={`m2-card m2-hold${expandedKey === cardKey ? ' m2-card--expanded' : ''}`}
                                        data-game-id={game.id}
                                        disabled={hookBusy}
                                        aria-describedby="m2-hold-hint"
                                        onPointerDown={() => pressStart(game, cardKey)}
                                        onPointerUp={pressEnd}
                                        onPointerLeave={pressCancel}
                                        onPointerCancel={pressCancel}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); pressStart(game, cardKey); } }}
                                        onKeyUp={(e) => { if (e.key === 'Enter') { e.preventDefault(); pressEnd(); } }}
                                        onClick={(e) => { e.stopPropagation(); }}
                                        onFocus={() => handleCardFocus(game.steamAppId, cardKey)}
                                        onBlur={handleCardBlur}
                                        onMouseEnter={handleCardMouseEnter}
                                        onMouseLeave={handleCardMouseLeave}
                                    >
                                        <span className="m2-card-row">
                                            {resolvedArt(capsuleCache, game.steamAppId) && (
                                                <img className="m2-card-art" alt="" aria-hidden="true" draggable={false} src={resolvedArt(capsuleCache, game.steamAppId)} />
                                            )}
                                            <span className="m2-card-body">
                                                <span className="m2-card-title">{displayTitle(game)}</span>
                                                <span className="m2-card-sub">{hook.note}</span>
                                            </span>
                                        </span>
                                        {expandArt && (
                                            <div
                                                className={`m2-card-expand${expandedKey === cardKey ? ' m2-card-expand--open' : ''}`}
                                                aria-hidden="true"
                                                style={{ backgroundImage: `url(${expandArt})` }}
                                            />
                                        )}
                                        {holdKeyRef.current === cardKey && holdProgress > 0 && (
                                            <div
                                                className="m2-card-progress"
                                                role="progressbar"
                                                aria-valuenow={Math.round(holdProgress * 100)}
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                aria-label={t('ui.maida2.hook_hold_hint')}
                                                style={{ width: `${holdProgress * 100}%` }}
                                            ></div>
                                        )}
                                    </button>
                                    {noteFor?.key === cardKey && renderNoteEditor()}
                                    <div className="m2-hook-actions">
                                        <button
                                            type="button"
                                            className="m2-hook-retract"
                                            onClick={() => handleRetract(hook)}
                                            disabled={hookBusy}
                                        >
                                            {t('ui.maida2.hook_retract')}
                                        </button>
                                        <div role="group" className="m2-state-group">
                                            {['keep', 'rest', 'released'].map(s => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    className="m2-state-btn"
                                                    aria-pressed={gameStates[game.id] === s}
                                                    onClick={() => handleSetState(game.id, s)}
                                                    disabled={hookBusy}
                                                >
                                                    {t(`ui.maida2.state_${s}`)}
                                                </button>
                                            ))}
                                        </div>
                                        {onHistory && (
                                            <button
                                                type="button"
                                                className="m2-history-btn"
                                                data-history-game={String(game.id)}
                                                onClick={() => onHistory(game)}
                                            >
                                                {t('ui.navigation.history')}
                                            </button>
                                        )}
                                    </div>
                                </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                <section className="m2-zone" aria-labelledby="m2-zone-recently-arrived">
                    <h2 id="m2-zone-recently-arrived" className="m2-zone-title">{t('ui.maida2.zone_recently_arrived')}</h2>
                    {zones.recentlyArrived.length === 0 ? (
                        <p className="m2-zone-empty">{t('ui.maida2.zone_recently_arrived_empty')}</p>
                    ) : (
                        <ul role="list" className="m2-list">
                            {zones.recentlyArrived.map(game =>
                                renderHoldCard(game, lastPlayedSubline(game)))}
                        </ul>
                    )}
                </section>

                <section className="m2-zone" aria-labelledby="m2-zone-all">
                    <h2 id="m2-zone-all" className="m2-zone-title">
                        <button
                            type="button"
                            className="m2-all-toggle"
                            aria-expanded={allOpen}
                            aria-label={t('ui.maida2.zone_all_toggle_aria', { count: allInstalled.length })}
                            onClick={() => setAllOpen(o => !o)}
                        >
                            {t('ui.maida2.zone_all')} <span aria-hidden="true">({allInstalled.length})</span>
                        </button>
                    </h2>
                    {allOpen && (
                        allInstalled.length === 0 ? (
                            <p className="m2-zone-empty">{t('ui.maida2.zone_all_empty')}</p>
                        ) : (
                            <ul role="list" className="m2-list">
                                {allInstalled.map(game =>
                                    renderHoldCard(game, lastPlayedSubline(game), 'all'))}
                            </ul>
                        )
                    )}
                </section>

                {themeToggle}
            </div>
            <Footer version={footerVersion} onNavigate={onNavigateLegal} />
        </main>
    );
}
