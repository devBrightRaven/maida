/**
 * ShowcaseList — displays curated games with remove and complete actions.
 * No sorting, no batch ops, no counters. Just the games and two actions each.
 */
export default function ShowcaseList({ games, onRemove, onComplete }) {
    return (
        <div className="showcase-list" role="list" aria-label="Your showcase">
            {games.map(game => (
                <div
                    key={game.id || game.steamAppId}
                    className="showcase-item"
                    role="listitem"
                >
                    <span className="showcase-item-title">{game.title}</span>
                    <div className="showcase-item-actions">
                        <button
                            type="button"
                            className="showcase-action-btn"
                            onClick={() => onComplete(game.id || game.steamAppId)}
                            aria-label={`Mark ${game.title} as completed`}
                        >
                            done
                        </button>
                        <button
                            type="button"
                            className="showcase-action-btn showcase-action-remove"
                            onClick={() => onRemove(game.id || game.steamAppId)}
                            aria-label={`Remove ${game.title} from showcase`}
                        >
                            remove
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
