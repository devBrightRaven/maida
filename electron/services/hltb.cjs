const { HowLongToBeatService } = require('howlongtobeat');

const hltbService = new HowLongToBeatService();

/**
 * Format HLTB hours for display.
 * Returns "~N hrs" or null if no valid data.
 * @param {number|null|undefined} hours
 * @returns {string|null}
 */
function formatHltbTime(hours) {
    if (hours == null || hours === 0) return null;
    return `~${Math.round(hours)} hrs`;
}

/**
 * Fetch HLTB data for a game title.
 * Returns { mainStory: number } or null on failure.
 * @param {string} title
 * @returns {Promise<{mainStory: number}|null>}
 */
async function fetchHltb(title) {
    try {
        const results = await hltbService.search(title);
        if (!results || results.length === 0) return null;
        const top = results[0];
        const mainStory = top.gameplayMain || top.gameplayMainExtra || null;
        if (!mainStory || mainStory <= 0) return null;
        return { mainStory };
    } catch (e) {
        console.warn(`[HLTB] Failed to fetch for "${title}": ${e.message}`);
        return null;
    }
}

module.exports = { fetchHltb, formatHltbTime };
