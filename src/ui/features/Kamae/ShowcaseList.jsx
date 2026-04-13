import { useState, useRef, useCallback, useEffect } from 'react';
import { t } from '../../../i18n';
import { MAX_KATA_GAMES } from '../../../core/katas';
import { vibrate, vibrateProgress } from '../../../services/haptics';

function getSteamHeaderUrl(steamAppId) {
    if (!steamAppId) return null;
    return `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`;
}

function GameCover({ steamAppId, title }) {
    const [failed, setFailed] = useState(false);
    const url = getSteamHeaderUrl(steamAppId);
    const initial = (title || '?')[0].toUpperCase();

    if (!url || failed) {
        return (
            <div className="showcase-item-img showcase-item-img--fallback">
                <span>{initial}</span>
            </div>
        );
    }

    return (
        <img
            src={url}
            alt=""
            className="showcase-item-img"
            loading="lazy"
            onError={() => setFailed(true)}
        />
    );
}

/**
 * Eased progress: 0→75% fast (1.5s), 75→100% slow (1s).
 * Fast feedback, then deliberate final confirmation.
 */
function easedProgress(elapsed) {
    const FAST_PHASE = 1500;  // 1.5s for first 75%
    const SLOW_PHASE = 1000;  // 1s for last 25%
    if (elapsed <= FAST_PHASE) {
        return (elapsed / FAST_PHASE) * 0.75;
    }
    const slowElapsed = elapsed - FAST_PHASE;
    return 0.75 + (slowElapsed / SLOW_PHASE) * 0.25;
}

const TOTAL_HOLD = 2500; // 1.5s + 1s

function HoldButton({ onConfirm, label, ariaLabel }) {
    const [progress, setProgress] = useState(0);
    const [confirming, setConfirming] = useState(false);
    const confirmStartRef = useRef(0);
    const startRef = useRef(null);
    const frameRef = useRef(null);
    const triggeredRef = useRef(false);
    const lastHapticRef = useRef(0);

    const reset = useCallback(() => {
        startRef.current = null;
        triggeredRef.current = false;
        setProgress(0);
        setConfirming(false);
        if (frameRef.current) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
    }, []);

    const animate = useCallback(() => {
        if (!startRef.current) return;
        const elapsed = Date.now() - startRef.current;
        const p = Math.min(easedProgress(elapsed), 1);
        setProgress(p);

        if (elapsed >= TOTAL_HOLD && !triggeredRef.current) {
            triggeredRef.current = true;
            vibrate('strong');
            onConfirm();
            reset();
        } else if (elapsed < TOTAL_HOLD) {
            const now = Date.now();
            if (now - lastHapticRef.current >= 400) {
                vibrateProgress(p);
                lastHapticRef.current = now;
            }
            frameRef.current = requestAnimationFrame(animate);
        }
    }, [onConfirm, reset]);

    const handleStart = useCallback(() => {
        if (!startRef.current) {
            startRef.current = Date.now();
            lastHapticRef.current = Date.now();
            vibrate('confirm');
            frameRef.current = requestAnimationFrame(animate);
        }
    }, [animate]);

    const handleEnd = useCallback(() => {
        if (startRef.current) {
            const elapsed = Date.now() - startRef.current;
            if (elapsed < 150) {
                // Too fast for a real hold — NVDA browse mode click
                // Switch to two-step confirm instead of auto-progress
                startRef.current = null;
                if (frameRef.current) {
                    cancelAnimationFrame(frameRef.current);
                    frameRef.current = null;
                }
                setProgress(0);
                setConfirming(true);
                confirmStartRef.current = Date.now();
                vibrate('confirm');
                return;
            }
        }
        reset();
    }, [reset]);

    // Keyboard hold: Enter down = start, up = end (focus mode / non-NVDA)
    const btnRef = useRef(null);
    useEffect(() => {
        const el = btnRef.current;
        if (!el) return;
        const onDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (!e.repeat) {
                    if (confirming && Date.now() - confirmStartRef.current > 500) {
                        onConfirm();
                        reset();
                    } else if (!confirming) {
                        handleStart();
                    }
                }
            }
        };
        const onUp = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (!confirming) handleEnd();
            }
        };
        el.addEventListener('keydown', onDown);
        el.addEventListener('keyup', onUp);
        return () => {
            el.removeEventListener('keydown', onDown);
            el.removeEventListener('keyup', onUp);
        };
    }, [handleStart, handleEnd, confirming, onConfirm, reset]);

    // Auto-cancel confirm state after 5 seconds
    useEffect(() => {
        if (!confirming) return;
        const timer = setTimeout(() => setConfirming(false), 5000);
        return () => clearTimeout(timer);
    }, [confirming]);

    useEffect(() => {
        return () => reset();
    }, [reset]);

    const isRunning = progress > 0;

    // Single live region announcement — previously three channels (aria-label
    // dynamic + two sr-only regions) caused redundant NVDA announcements.
    // aria-label stays static (ariaLabel); state transitions narrated via this.
    const stateAnnouncement = confirming
        ? t('ui.kamae.remove_confirm_aria')
        : isRunning
            ? t('ui.kamae.remove_progress_aria')
            : '';

    return (
        <button
            ref={btnRef}
            type="button"
            className={`showcase-hold-btn ${confirming ? 'showcase-hold-btn--confirm' : ''}`}
            onPointerDown={() => {
                if (confirming && Date.now() - confirmStartRef.current > 500) {
                    onConfirm();
                    reset();
                } else if (!confirming) {
                    handleStart();
                }
            }}
            onPointerUp={() => { if (!confirming) handleEnd(); }}
            onPointerLeave={() => { if (!confirming) handleEnd(); }}
            onClick={(e) => {
                e.stopPropagation();
                if (confirming && Date.now() - confirmStartRef.current > 500) {
                    onConfirm();
                    reset();
                }
            }}
            aria-label={ariaLabel}
            onKeyDown={(e) => {
                if (e.key === 'Escape' && confirming) {
                    e.stopPropagation();
                    reset();
                }
            }}
        >
            <span className="showcase-hold-bg" style={{ width: `${progress * 100}%` }} />
            <span className="showcase-hold-label">
                {confirming ? t('ui.kamae.remove_confirm') : label}
            </span>
            <span className="sr-only" role="status" aria-live="polite">
                {stateAnnouncement}
            </span>
        </button>
    );
}

/**
 * ShowcaseList — displays curated games with cover images.
 * "put back to the shelf" requires holding for 3 seconds.
 */
export default function ShowcaseList({ games, onRemove, isKataMode }) {
    return (
        <section className="showcase-section" aria-labelledby="showcase-heading">
            <h3 id="showcase-heading" className="showcase-heading">{t('ui.kamae.games_heading')}</h3>
            {isKataMode && (
                <div className="showcase-counter" aria-live="polite">
                    <span aria-hidden="true">{games.length} / {MAX_KATA_GAMES}</span>
                    <span className="sr-only">
                        {games.length >= MAX_KATA_GAMES
                            ? t('ui.katas.counter_full')
                            : t('ui.katas.counter_aria', { count: games.length, max: MAX_KATA_GAMES })}
                    </span>
                </div>
            )}
            <ul className="showcase-list">
            {games.map(game => {
                const id = game.id || game.steamAppId;
                const headerUrl = getSteamHeaderUrl(game.steamAppId);
                return (
                    <li
                        key={id}
                        className={`showcase-item ${!game.installed ? 'showcase-item--dimmed' : ''}`}
                        tabIndex={-1}
                        aria-label={game.title}
                    >
                        <GameCover steamAppId={game.steamAppId} title={game.title} />
                        <div className="showcase-item-info">
                            <span className="showcase-item-title">{game.title}</span>
                            {!game.installed && <span className="showcase-item-uninstalled">{t('ui.kamae.not_installed')}</span>}
                        </div>
                        {isKataMode && (
                            <div className="showcase-item-actions">
                                <HoldButton
                                    onConfirm={() => onRemove(id)}
                                    label={t('ui.kamae.remove_from_kata')}
                                    ariaLabel={t('ui.kamae.remove_aria', { title: game.title })}
                                />
                            </div>
                        )}
                    </li>
                );
            })}
            </ul>
        </section>
    );
}
