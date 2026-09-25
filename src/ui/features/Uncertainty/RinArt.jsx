import { useEffect, useState } from 'react';
import bridge from '../../../services/bridge';
import RinFacingMark from './RinFacingMark';

// Dev-only preview switch: set localStorage `maida_dev_force_no_art` to "1"
// to see the no-art fallback on games that do have hero art. Stripped from
// production builds (import.meta.env.DEV is false there).
function devForceNoArt() {
    if (!import.meta.env.DEV) return false;
    try {
        return localStorage.getItem('maida_dev_force_no_art') === '1';
    } catch {
        return false;
    }
}

/**
 * RinArt
 * Presentational game art for the Rin stage. Uses the local Steam hero art
 * only (bridge.getArt, zero network). The box always reserves its aspect
 * ratio, so the actions below never shift while art loads, is missing, or
 * fails. When there is no hero art or it failed, the geometric
 * RinFacingMark renders instead of fake game art (inline SVG, nothing to
 * load or fail). Decorative: the game name is the accessible label, so the box
 * (and every image inside it) is hidden from assistive technology.
 */
export default function RinArt({ appId }) {
    const [art, setArt] = useState({ appId: null, url: null, status: 'loading' });

    useEffect(() => {
        let cancelled = false;
        if (!appId || devForceNoArt()) {
            setArt({ appId, url: null, status: 'none' });
            return undefined;
        }
        setArt({ appId, url: null, status: 'loading' });
        Promise.resolve(bridge.getArt(appId, 'hero')).then((url) => {
            if (cancelled) return;
            const ok = typeof url === 'string' && url.length > 0;
            setArt({ appId, url: ok ? url : null, status: ok ? 'ready' : 'none' });
        }, () => {
            if (!cancelled) setArt({ appId, url: null, status: 'failed' });
        });
        return () => { cancelled = true; };
    }, [appId]);

    const url = art.appId === appId ? art.url : null;
    const status = art.appId === appId ? art.status : 'loading';

    const showFallback = status === 'none' || status === 'failed';

    return (
        <div className={`rin-art rin-art--${status}`} data-art-status={status} aria-hidden="true">
            {url && (
                <img
                    className="rin-art__img"
                    src={url}
                    alt=""
                    draggable="false"
                    onError={() => setArt({ appId, url: null, status: 'failed' })}
                />
            )}
            {showFallback && <RinFacingMark />}
        </div>
    );
}
