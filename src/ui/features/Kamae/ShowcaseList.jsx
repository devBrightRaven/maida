import { useState, useRef, useCallback, useEffect } from 'react';
import { t } from '../../../i18n';
import { MAX_KATA_GAMES } from '../../../core/katas';

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
    const startRef = useRef(null);
    const frameRef = useRef(null);
    const triggeredRef = useRef(false);

    const reset = useCallback(() => {
        startRef.current = null;
        triggeredRef.current = false;
        setProgress(0);
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
            onConfirm();
            reset();
        } else if (elapsed < TOTAL_HOLD) {
            frameRef.current = requestAnimationFrame(animate);
        }
    }, [onConfirm, reset]);

    const handleStart = useCallback(() => {
        if (!startRef.current) {
            startRef.current = Date.now();
            frameRef.current = requestAnimationFrame(animate);
        }
    }, [animate]);

    const handleEnd = useCallback(() => {
        reset();
    }, [reset]);

    // Keyboard hold: Enter/Space down = start, up = end
    const handleKeyDown = useCallback((e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            handleStart();
        }
    }, [handleStart]);

    const handleKeyUp = useCallback((e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            handleEnd();
        }
    }, [handleEnd]);

    useEffect(() => {
        return () => reset();
    }, [reset]);

    return (
        <button
            type="button"
            className="showcase-hold-btn"
            onPointerDown={handleStart}
            onPointerUp={handleEnd}
            onPointerLeave={handleEnd}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            aria-label={ariaLabel}
        >
            <span className="showcase-hold-bg" style={{ width: `${progress * 100}%` }} />
            <span className="showcase-hold-label">{label}</span>
        </button>
    );
}

/**
 * ShowcaseList — displays curated games with cover images.
 * "put back to the shelf" requires holding for 3 seconds.
 */
export default function ShowcaseList({ games, onRemove, isKataMode }) {
    return (
        <section className="showcase-section">
            <h3 className="showcase-heading">{t('ui.kamae.games_heading')}</h3>
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
