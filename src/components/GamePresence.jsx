import React from 'react';

/**
 * GamePresence
 * A high-level component that renders the "Concept" of the game.
 * It adapts its visual language based on the CSS context it is placed in.
 */

function formatHltbTime(hours) {
    if (hours == null || hours === 0) return null;
    return `~${Math.round(hours)} hrs`;
}

export default function GamePresence({ game }) {
    if (!game) return null;
    const hltbTime = formatHltbTime(game.hltb?.mainStory);

    return (
        <div className="game-presence">
            <div className="game-identifier">
                <h1 className="game-title">{game.title}</h1>
                {hltbTime && (
                    <span className="game-hltb">{hltbTime}</span>
                )}
                <span className="game-dev">{game.developer}</span>
            </div>

            <div className="game-meta">
                <span className="meta-item">{game.lastPlayed}</span>
            </div>
        </div>
    );
}
