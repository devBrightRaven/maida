/**
 * Corner button for switching between Aida and Neri faces.
 * Bottom-right in Aida (→ Neri), bottom-left in Neri (← Aida).
 * No tooltip, no label — only aria-label for screen readers.
 */
export default function FaceSwitchButton({ direction, onClick }) {
    const isToNeri = direction === 'to-neri';

    return (
        <button
            type="button"
            className={`face-switch-btn face-switch-${isToNeri ? 'right' : 'left'}`}
            onClick={onClick}
            aria-label={isToNeri ? 'Switch to curation view' : 'Switch to decision view'}
        >
            <span aria-hidden="true">{isToNeri ? '\u203A' : '\u2039'}</span>
        </button>
    );
}
