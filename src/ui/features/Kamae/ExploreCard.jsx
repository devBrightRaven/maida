import { useState } from 'react';
import { t } from '../../../i18n';

/**
 * Steam CDN image URLs — no API key needed.
 */
function getSteamHeaderUrl(steamAppId) {
    if (!steamAppId) return null;
    return `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`;
}

function getSteamCoverUrl(steamAppId) {
    if (!steamAppId) return null;
    return `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/library_600x900.jpg`;
}

/**
 * ExploreCard — single game card for Tinder-style discovery.
 * Shows cover image, title, HLTB estimate.
 * Right/Enter = add to showcase, Left/Esc = dismiss to box.
 */
export default function ExploreCard({ game, onAdd, onDismiss }) {
    const [imgError, setImgError] = useState(false);
    const [imgSrc, setImgSrc] = useState('cover'); // 'cover' | 'header' | 'none'

    if (!game) return null;

    const title = game.title || 'Unknown';
    const appId = game.steamAppId;
    const hltb = game.hltb?.main;

    const coverUrl = getSteamCoverUrl(appId);
    const headerUrl = getSteamHeaderUrl(appId);

    const handleImgError = () => {
        if (imgSrc === 'cover') {
            setImgSrc('header');
        } else {
            setImgSrc('none');
        }
    };

    const currentImgUrl = imgSrc === 'cover' ? coverUrl : imgSrc === 'header' ? headerUrl : null;

    return (
        <div className="explore-card" role="article" aria-label={title}>
            {currentImgUrl && (
                <div className="explore-card-img-container">
                    <img
                        src={currentImgUrl}
                        alt={`${title} cover art`}
                        className="explore-card-img"
                        onError={handleImgError}
                        loading="eager"
                    />
                </div>
            )}

            {imgSrc === 'none' && (
                <div className="explore-card-no-img" aria-hidden="true">
                    <span>{title.charAt(0)}</span>
                </div>
            )}

            <h2 className="explore-card-title">{title}</h2>

            {hltb && (
                <p className="explore-card-hltb">
                    ~{Math.round(hltb / 60)} hours
                </p>
            )}

            <div className="explore-card-actions">
                <button
                    type="button"
                    className="explore-card-btn explore-card-dismiss"
                    onClick={onDismiss}
                    aria-label="Skip this game"
                >
                    {t('ui.explore.later')}
                </button>
                <button
                    type="button"
                    className="explore-card-btn explore-card-add"
                    onClick={onAdd}
                    aria-label="Add to showcase"
                >
                    {t('ui.explore.add')}
                </button>
            </div>
        </div>
    );
}
