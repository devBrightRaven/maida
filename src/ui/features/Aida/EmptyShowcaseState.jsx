import { t } from '../../../i18n';

/**
 * Shown in Rin when showcase is empty — no candidates for the dice.
 * Quiet message with entry to Kamae. No pressure.
 */
export default function EmptyShowcaseState({ onGoToKamae }) {
    return (
        <div className="empty-showcase-state">
            <p className="empty-showcase-text">
                {t('ui.rin.empty_showcase')}
            </p>
            {onGoToKamae && (
                <button
                    type="button"
                    className="empty-showcase-btn"
                    onClick={onGoToKamae}
                >
                    {t('ui.rin.empty_showcase_btn')}
                </button>
            )}
        </div>
    );
}
