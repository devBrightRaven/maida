/**
 * Format playtime from seconds to human-readable string.
 * @param {number|null|undefined} seconds - playtime in seconds
 * @returns {string|null} "Xh" for whole hours, "Xh Ym" otherwise, null for 0/null/undefined
 */
export function formatPlaytime(seconds) {
    if (!seconds || seconds <= 0) return null;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);

    if (minutes === 0) return `${hours}h`;
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
}
