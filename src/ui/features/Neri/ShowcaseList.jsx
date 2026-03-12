/**
 * ShowcaseList — displays curated games with cover images, remove and complete actions.
 * No sorting, no batch ops, no counters. Just the games and two actions each.
 */

function getSteamHeaderUrl(steamAppId) {
    if (!steamAppId) return null;
    return `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`;
}

export default function ShowcaseList({ games, onRemove }) {
    return (
        <div className="showcase-list" role="list" aria-label="Your showcase">
            {games.map(game => {
                const id = game.id || game.steamAppId;
                const headerUrl = getSteamHeaderUrl(game.steamAppId);
                return (
                    <div
                        key={id}
                        className="showcase-item"
                        role="listitem"
                    >
                        {headerUrl && (
                            <img
                                src={headerUrl}
                                alt=""
                                className="showcase-item-img"
                                loading="lazy"
                            />
                        )}
                        <span className="showcase-item-title">{game.title}</span>
                        <div className="showcase-item-actions">
                            <button
                                type="button"
                                className="showcase-action-btn"
                                onClick={() => onRemove(id)}
                                aria-label={`Put ${game.title} back to shelf`}
                            >
                                put back
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
