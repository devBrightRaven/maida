/**
 * Shown when the daily explore limit (10 cards) is reached.
 */
export default function ExploreLimitReached({ onBack }) {
    return (
        <div className="explore-limit">
            <p className="explore-limit-text">That's enough for today.</p>
            <p className="explore-limit-hint">Come back tomorrow to explore more.</p>
            <button
                type="button"
                className="explore-limit-btn"
                onClick={onBack}
            >
                back to shelf
            </button>
        </div>
    );
}
