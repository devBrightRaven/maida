import { useEffect, useState } from 'react';
import bridge from '../../../services/bridge';

/**
 * RinArt
 * Presentational game art for the Rin stage. Uses the local Steam hero art
 * only (bridge.getArt, zero network). The box always reserves its aspect
 * ratio, so the actions below never shift while art loads, is missing, or
 * fails. Missing/failed art renders a quiet solid surface, never fake art.
 * Decorative: the game name is the accessible label, so the box is hidden
 * from assistive technology.
 */
export default function RinArt({ appId }) {
    const [art, setArt] = useState({ appId: null, url: null, status: 'loading' });

    useEffect(() => {
        let cancelled = false;
        if (!appId) {
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
        </div>
    );
}
