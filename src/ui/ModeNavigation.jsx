import { t } from '../i18n';
import './ModeNavigation.css';

const FACES = [
    { id: 'maida2', name: 'Maai', glyph: '間合い' },
    { id: 'rin', name: 'Rin', glyph: '臨' },
    { id: 'kamae', name: 'Kamae', glyph: '構' },
];

function faceLabel(face) {
    return t(`ui.navigation.${face.id}_label`);
}

export default function ModeNavigation({ face, layout = 'tabs', onSwitch, onHistory, onSettings }) {
    const currentIndex = Math.max(0, FACES.findIndex(item => item.id === face));
    const current = FACES[currentIndex];
    const previous = FACES[(currentIndex + FACES.length - 1) % FACES.length];
    const next = FACES[(currentIndex + 1) % FACES.length];
    const switchFace = (target) => {
        if (target !== face) onSwitch?.(target);
    };

    return (
        <nav className="mode-navigation" aria-label={t('ui.navigation.title')}>
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
                        >
                            <span className="mode-navigation__symbol" aria-hidden="true">{item.id === 'maida2' ? '◌' : item.id === 'rin' ? '│' : '◇'}</span>
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
