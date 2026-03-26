import { forwardRef } from 'react';
import { t } from '../i18n';

/**
 * Edge button for switching between Rin and Kamae faces.
 * Right edge in Rin (→ Kamae), left edge in Kamae (← Rin).
 */
const FaceSwitchButton = forwardRef(function FaceSwitchButton({ direction, onClick }, ref) {
    const isToKamae = direction === 'to-kamae';

    return (
        <button
            ref={ref}
            type="button"
            className={`face-switch-btn face-switch-${isToKamae ? 'right' : 'left'}`}
            onClick={onClick}
            aria-label={isToKamae ? t('ui.button.switch_to_kamae_aria') : t('ui.button.switch_to_rin_aria')}
        >
            <span className="face-switch-label" aria-hidden="true">
                <span className="face-switch-text">{isToKamae ? t('ui.button.switch_to_kamae') : t('ui.button.switch_to_rin')}</span>
                <span className="face-switch-arrow">{isToKamae ? '→' : '←'}</span>
            </span>
            <span className="face-switch-tooltip">{isToKamae ? t('ui.button.switch_tooltip_kamae') : t('ui.button.switch_tooltip_rin')}</span>
        </button>
    );
});

export default FaceSwitchButton;
