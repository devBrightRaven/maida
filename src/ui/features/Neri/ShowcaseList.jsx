import { useState, useRef, useCallback, useEffect } from 'react';
import { MAX_SHOWCASE } from '../../../core/showcase';

function getSteamHeaderUrl(steamAppId) {
    if (!steamAppId) return null;
    return `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`;
}

const HOLD_DURATION = 3000; // 3 seconds

/**
 * Long-press button — requires holding for 3 seconds to activate.
 * Shows progress bar while holding.
 */
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
        const p = Math.min(elapsed / HOLD_DURATION, 1);
        setProgress(p);

        if (p >= 1 && !triggeredRef.current) {
            triggeredRef.current = true;
            onConfirm();
            reset();
        } else if (p < 1) {
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
export default function ShowcaseList({ games, onRemove }) {
    return (
        <div className="showcase-list" role="list" aria-label="Your showcase">
            <div className="showcase-counter" aria-live="polite">
                {games.length} / {MAX_SHOWCASE}
            </div>
            {games.map(game => {
                const id = game.id || game.steamAppId;
                const headerUrl = getSteamHeaderUrl(game.steamAppId);
                return (
                    <div
                        key={id}
                        className="showcase-item"
                        role="listitem"
                    >
                        {headerUrl && (
                            <img
                                src={headerUrl}
                                alt=""
                                className="showcase-item-img"
                                loading="lazy"
                            />
                        )}
                        <div className="showcase-item-info">
                            <span className="showcase-item-title">{game.title}</span>
                            {!game.installed && <span className="showcase-item-uninstalled">not installed</span>}
                        </div>
                        <div className="showcase-item-actions">
                            <HoldButton
                                onConfirm={() => onRemove(id)}
                                label="put back to the shelf"
                                ariaLabel={`Hold to put ${game.title} back to shelf`}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
