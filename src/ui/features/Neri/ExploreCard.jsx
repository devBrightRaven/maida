/**
 * ExploreCard — single game card for Tinder-style discovery.
 * Right/Enter = add to showcase, Left/Esc = dismiss to box.
 */
export default function ExploreCard({ game, onAdd, onDismiss }) {
    if (!game) return null;

    const title = game.title || 'Unknown';
    const hltb = game.hltb?.main;

    return (
        <div className="explore-card" role="article" aria-label={title}>
            <h2 className="explore-card-title">{title}</h2>
            {hltb && (
                <p className="explore-card-hltb">{Math.round(hltb / 60)} hours (main story)</p>
            )}
            <div className="explore-card-actions">
                <button
                    type="button"
                    className="explore-card-btn explore-card-dismiss"
                    onClick={onDismiss}
                    aria-label="Skip this game"
                >
                    later
                </button>
                <button
                    type="button"
                    className="explore-card-btn explore-card-add"
                    onClick={onAdd}
                    aria-label="Add to showcase"
                >
                    add
                </button>
            </div>
        </div>
    );
}
