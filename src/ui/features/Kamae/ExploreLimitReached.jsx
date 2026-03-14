import { t } from '../../../i18n';

/**
 * Shown when the daily explore limit (10 cards) is reached.
 */
export default function ExploreLimitReached({ onBack }) {
    return (
        <div className="explore-limit">
            <p className="explore-limit-text">{t('ui.explore.limit_title')}</p>
            <p className="explore-limit-hint">{t('ui.explore.limit_hint')}</p>
            <button
                type="button"
                className="explore-limit-btn"
                onClick={onBack}
            >
                {t('ui.explore.limit_back')}
            </button>
        </div>
    );
}
