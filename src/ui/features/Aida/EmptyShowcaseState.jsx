/**
 * Shown in Rin when showcase is empty — no candidates for the dice.
 * Quiet message with entry to Kamae. No pressure.
 */
export default function EmptyShowcaseState({ onGoToKamae }) {
    return (
        <div className="empty-showcase-state">
            <p className="empty-showcase-text">
                Nothing on your shelf yet.
            </p>
            {onGoToKamae && (
                <button
                    type="button"
                    className="empty-showcase-btn"
                    onClick={onGoToKamae}
                >
                    add a few games
                </button>
            )}
        </div>
    );
}
