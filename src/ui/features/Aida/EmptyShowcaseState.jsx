/**
 * Shown in Aida when showcase is empty — no candidates for the dice.
 * Quiet message with entry to Neri. No pressure.
 */
export default function EmptyShowcaseState({ onGoToNeri }) {
    return (
        <div className="empty-showcase-state">
            <p className="empty-showcase-text">
                Nothing on your shelf yet.
            </p>
            {onGoToNeri && (
                <button
                    type="button"
                    className="empty-showcase-btn"
                    onClick={onGoToNeri}
                >
                    add a few games
                </button>
            )}
        </div>
    );
}
