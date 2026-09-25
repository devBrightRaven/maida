import { useEffect, useRef } from 'react';
import { t } from '../i18n';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { scheduleBloom, cancelBloom, shouldPlayBloom } from './modeBloom';
import './ModeNavigation.css';

// Focus that lands within this window after the rail mounts is the app (or a
// face switch) placing focus, not the user moving it: no bloom for that.
const BLOOM_MOUNT_QUIET_MS = 500;

const FACES = [
    { id: 'maida2', name: 'Maai', glyph: '間合い' },
    { id: 'rin', name: 'Rin', glyph: '臨' },
    { id: 'kamae', name: 'Kamae', glyph: '構' },
];

function faceLabel(face) {
    return t(`ui.navigation.${face.id}_label`);
}

// Decorative mode symbols: circle (Maai), triangle (Rin), square (Kamae).
// Drawn as SVG on a shared 20x20 viewBox with identical stroke weight so the
// three read as one balanced family rather than mismatched glyph metrics.
const SYMBOL_SHAPES = {
    maida2: <circle cx="10" cy="10" r="7" />,
    rin: <polygon points="10,2.6 17.4,16.2 2.6,16.2" />,
    kamae: <rect x="3.75" y="3.75" width="12.5" height="12.5" />,
};

function ModeSymbol({ id }) {
    return (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true" focusable="false">
            {SYMBOL_SHAPES[id]}
        </svg>
    );
}

export default function ModeNavigation({ face, layout = 'tabs', onSwitch, onHistory, onSettings, largeMotion = true }) {
    const osReducedMotion = usePrefersReducedMotion();
    const bloomOn = shouldPlayBloom({ osReducedMotion, largeMotion });
    const focusBloomReady = useRef(false);
    useEffect(() => {
        const id = setTimeout(() => { focusBloomReady.current = true; }, BLOOM_MOUNT_QUIET_MS);
        return () => clearTimeout(id);
    }, []);
    useEffect(() => {
        if (!bloomOn) cancelBloom();
    }, [bloomOn]);
    const requestBloom = (id, viaFocus) => {
        if (!bloomOn) return;
        if (viaFocus && !focusBloomReady.current) return;
        scheduleBloom(id);
    };
    const currentIndex = Math.max(0, FACES.findIndex(item => item.id === face));
    const current = FACES[currentIndex];
    const previous = FACES[(currentIndex + FACES.length - 1) % FACES.length];
    const next = FACES[(currentIndex + 1) % FACES.length];
    const switchFace = (target) => {
        if (target !== face) onSwitch?.(target);
    };

    return (
        <nav className="mode-navigation" aria-label={t('ui.navigation.title')}>
            {/* Decorative brand mark; the window title already names the app. */}
            <p className="mode-navigation__brand" aria-hidden="true">{t('ui.maida2.title')}</p>
            {layout === 'pager' ? (
                <div className="mode-navigation__pager" role="group" aria-label={t('ui.navigation.pager')}>
                    <button
                        type="button"
                        className="mode-navigation__button mode-navigation__pager-button"
                        onClick={() => switchFace(previous.id)}
                    >
                        <span className="mode-navigation__direction">
                            <span aria-hidden="true">←</span> {t('ui.navigation.previous')}
                        </span>
                        <span>{faceLabel(previous)}</span>
                    </button>
                    <div className="mode-navigation__current" aria-current="page">
                        <strong>{faceLabel(current)}</strong>
                        <span>{currentIndex + 1} / {FACES.length}</span>
                    </div>
                    <button
                        type="button"
                        className="mode-navigation__button mode-navigation__pager-button mode-navigation__pager-button--next"
                        onClick={() => switchFace(next.id)}
                    >
                        <span className="mode-navigation__direction">
                            {t('ui.navigation.next')} <span aria-hidden="true">→</span>
                        </span>
                        <span>{faceLabel(next)}</span>
                    </button>
                </div>
            ) : (
                <div className="mode-navigation__tabs" role="group" aria-label={t('ui.navigation.tabs')}>
                    {FACES.map(item => (
                        <button
                            key={item.id}
                            data-face={item.id}
                            type="button"
                            className="mode-navigation__button mode-navigation__tab"
                            aria-current={item.id === face ? 'page' : undefined}
                            onClick={() => switchFace(item.id)}
                            onMouseEnter={() => requestBloom(item.id, false)}
                            onFocus={() => requestBloom(item.id, true)}
                        >
                            <span className="mode-navigation__symbol" aria-hidden="true"><ModeSymbol id={item.id} /></span>
                            <span className="mode-navigation__copy">
                                <span>{faceLabel(item)}</span>
                                <span className="mode-navigation__glyph">{t(`ui.navigation.${item.id}_description`)}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {(onHistory || onSettings) && (
                <div className="mode-navigation__utilities">
                    {onHistory && (
                        <button
                            type="button"
                            className="mode-navigation__button mode-navigation__utility"
                            data-history-game=""
                            onClick={() => onHistory()}
                        >
                            {t('ui.navigation.history')}
                        </button>
                    )}
                    {onSettings && (
                        <button type="button" className="mode-navigation__button mode-navigation__utility" onClick={() => onSettings()}>
                            {t('ui.navigation.settings')}
                        </button>
                    )}
                </div>
            )}
        </nav>
    );
}
