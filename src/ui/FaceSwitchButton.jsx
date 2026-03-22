import { forwardRef } from 'react';

/**
 * Edge button for switching between Rin and Kamae faces.
 * Right edge in Rin (→ Kamae), left edge in Kamae (← Rin).
 * No tooltip, no label — only aria-label for screen readers.
 */
const FaceSwitchButton = forwardRef(function FaceSwitchButton({ direction, onClick }, ref) {
    const isToKamae = direction === 'to-kamae';

    return (
        <button
            ref={ref}
            type="button"
            className={`face-switch-btn face-switch-${isToKamae ? 'right' : 'left'}`}
            onClick={onClick}
            aria-label={isToKamae ? 'Switch to Kamae (Ctrl+Tab / RB / R1)' : 'Switch to Rin (Ctrl+Tab / LB / L1)'}
            title={isToKamae ? 'Kamae 構 (Ctrl+Tab / RB / R1)' : 'Rin 臨 (Ctrl+Tab / LB / L1)'}
        >
            <span aria-hidden="true">{isToKamae ? '\u203A' : '\u2039'}</span>
        </button>
    );
});

export default FaceSwitchButton;
