import { forwardRef } from 'react';

/**
 * Edge button for switching between Aida and Neri faces.
 * Right edge in Aida (→ Neri), left edge in Neri (← Aida).
 * No tooltip, no label — only aria-label for screen readers.
 */
const FaceSwitchButton = forwardRef(function FaceSwitchButton({ direction, onClick }, ref) {
    const isToNeri = direction === 'to-neri';

    return (
        <button
            ref={ref}
            type="button"
            className={`face-switch-btn face-switch-${isToNeri ? 'right' : 'left'}`}
            onClick={onClick}
            aria-label={isToNeri ? 'Switch to curation view' : 'Switch to decision view'}
        >
            <span aria-hidden="true">{isToNeri ? '\u203A' : '\u2039'}</span>
        </button>
    );
});

export default FaceSwitchButton;
