/**
 * Empty state for showcase — encourages search or explore.
 * No backlog pressure language. No counts.
 */
export default function ShowcaseEmpty({ onExplore }) {
    return (
        <div className="showcase-empty">
            <p className="showcase-empty-text">
                Your shelf is empty.
            </p>
            <p className="showcase-empty-hint">
                Search for a game you've been wanting to play, or explore your collection.
            </p>
            {onExplore && (
                <button
                    type="button"
                    className="showcase-empty-explore-btn"
                    onClick={onExplore}
                >
                    Explore
                </button>
            )}
        </div>
    );
}
