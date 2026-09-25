import { useEffect, useState } from 'react';
import bridge from '../../../services/bridge';

// One lookup per appId for the whole session: the kata strips and the game
// list show the same capsules, so they share the promise instead of asking
// the bridge twice. bridge.getArt() itself never rejects — its call()
// wrapper already turns a failed invoke into a resolved null, same as a
// genuine "no art" result — so the rejection branch below is unreachable in
// practice, and a failed read IS cached for the session same as a real
// none/failed status; a later mount does not retry it (review 2026-09-26
// C1: the previous comment claimed the opposite).
const capsuleCache = new Map();

function loadCapsule(appId) {
    const key = String(appId);
    if (!capsuleCache.has(key)) {
        const promise = Promise.resolve(bridge.getArt(appId, 'capsule')).then(
            (url) => (typeof url === 'string' && url.length > 0 ? url : null),
            () => {
                capsuleCache.delete(key);
                return null;
            },
        );
        capsuleCache.set(key, promise);
    }
    return capsuleCache.get(key);
}

/**
 * CapsuleThumb
 * Decorative Steam capsule from the local art cache (bridge.getArt). The box
 * always reserves its 2:3 shape; missing or failed art gets the quiet empty-
 * slot marker (KamaeView.css, kamae-capsule--none/--failed) instead of a
 * letter or fake art. The game name next to it is the accessible label, so
 * the thumb is hidden from assistive technology. Rendered as <span> so it is
 * valid inside a <button>.
 */
// Dev-only preview switch: set localStorage `maida_dev_force_no_capsule` to
// "1" to show the empty-slot marker on every other game (odd appIds), so it
// can be seen next to real capsules. Stripped from production builds.
function devForceNoCapsule(appId) {
    if (!import.meta.env.DEV) return false;
    try {
        return localStorage.getItem('maida_dev_force_no_capsule') === '1' && Number(appId) % 2 === 1;
    } catch {
        return false;
    }
}

export default function CapsuleThumb({ appId, className = '' }) {
    const [art, setArt] = useState({ appId: null, url: null, status: 'loading' });

    useEffect(() => {
        let cancelled = false;
        if (!appId || devForceNoCapsule(appId)) {
            setArt({ appId, url: null, status: 'none' });
            return undefined;
        }
        loadCapsule(appId).then((url) => {
            if (!cancelled) setArt({ appId, url, status: url ? 'ready' : 'none' });
        });
        return () => { cancelled = true; };
    }, [appId]);

    const current = art.appId === appId ? art : { url: null, status: appId ? 'loading' : 'none' };

    return (
        <span
            className={`kamae-capsule kamae-capsule--${current.status} ${className}`.trim()}
            data-art-status={current.status}
            aria-hidden="true"
        >
            {current.url && (
                <img
                    className="kamae-capsule__img"
                    src={current.url}
                    alt=""
                    draggable="false"
                    onError={() => setArt({ appId, url: null, status: 'failed' })}
                />
            )}
        </span>
    );
}

/**
 * CapsuleStrip
 * Up to four capsules for a kata, then a quiet "+N" cell for the rest.
 * `games` holds the resolved game (or null) for each of the kata's first
 * gameIds; `total` is the kata's full game count.
 */
export function CapsuleStrip({ games, total }) {
    const shown = games.slice(0, 4);
    const extra = total - shown.length;
    return (
        <span className="kamae-strip" aria-hidden="true">
            {shown.map((game, index) => (
                <CapsuleThumb key={game ? (game.id || game.steamAppId) : `missing-${index}`} appId={game?.steamAppId} className="kamae-strip__cell" />
            ))}
            {extra > 0 && <span className="kamae-strip__cell kamae-strip__more">+{extra}</span>}
        </span>
    );
}
