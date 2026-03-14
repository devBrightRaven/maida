const https = require('https');

/**
 * IGDB Service — fetch time-to-beat data from IGDB API.
 *
 * IGDB API uses POST with Apicalypse query language.
 * Headers: Client-ID + Authorization: Bearer <token>
 * Rate limit: 4 req/s → enforce 250ms delay between requests.
 */

let lastRequestAt = 0;

/**
 * Enforce 250ms minimum gap between IGDB requests.
 */
async function rateLimit() {
    const now = Date.now();
    const elapsed = now - lastRequestAt;
    if (elapsed < 250) {
        await new Promise((r) => setTimeout(r, 250 - elapsed));
    }
    lastRequestAt = Date.now();
}

/**
 * Send a POST request to the IGDB API.
 * @param {string} endpoint - e.g. "games", "external_games"
 * @param {string} body - Apicalypse query
 * @param {string} clientId
 * @param {string} accessToken
 * @returns {Promise<Array|null>}
 */
async function igdbPost(endpoint, body, clientId, accessToken) {
    await rateLimit();

    return new Promise((resolve) => {
        const req = https.request(
            {
                hostname: 'api.igdb.com',
                path: `/v4/${endpoint}`,
                method: 'POST',
                headers: {
                    'Client-ID': clientId,
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'text/plain',
                },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            console.warn(`[IGDB] API ${endpoint} returned ${res.statusCode}`);
                            console.warn(`[IGDB] Query: ${body}`);
                            console.warn(`[IGDB] Response: ${data.slice(0, 300)}`);
                            resolve(null);
                            return;
                        }
                        resolve(JSON.parse(data));
                    } catch (e) {
                        console.warn('[IGDB] Failed to parse response:', e.message);
                        resolve(null);
                    }
                });
            }
        );

        req.on('error', (e) => {
            console.warn('[IGDB] Request failed:', e.message);
            resolve(null);
        });

        req.write(body);
        req.end();
    });
}

/**
 * Extract time_to_beat from an IGDB game object.
 * @param {object} game - IGDB game with time_to_beat field
 * @returns {{ hastily: number|null, normally: number|null, completely: number|null } | null}
 */
function extractTimeToBeat(data) {
    if (!data) return null;

    const hastily = data.hastily || null;
    const normally = data.normally || null;
    const completely = data.completely || null;

    // All null means no data
    if (!hastily && !normally && !completely) return null;

    return { hastily, normally, completely };
}

/**
 * Fetch time-to-beat data for a game from IGDB.
 *
 * Strategy:
 * 1. Primary: Look up by Steam appId via external_games (category 1 = Steam)
 * 2. Fallback: Search by title, filter main games (category 0)
 *
 * @param {string|number} steamAppId
 * @param {string} title - Game title for fallback search
 * @param {string} accessToken - Twitch OAuth token
 * @param {string} clientId - Twitch Client ID
 * @returns {Promise<{ hastily: number|null, normally: number|null, completely: number|null } | null>}
 */
async function fetchIgdbTimeToBeat(steamAppId, title, accessToken, clientId) {
    if (!accessToken || !clientId) return null;

    // Step 1: Get IGDB game ID via Steam appId or title search
    let igdbGameId = null;

    if (steamAppId) {
        const query = `fields game; where uid = "${steamAppId}" & category = 1; limit 1;`;
        const results = await igdbPost('external_games', query, clientId, accessToken);
        if (results && results.length > 0) {
            igdbGameId = results[0].game;
        }
    }

    if (!igdbGameId && title) {
        const query = `fields id; search "${title.replace(/"/g, '\\"')}"; limit 1;`;
        const results = await igdbPost('games', query, clientId, accessToken);
        if (results && results.length > 0) {
            igdbGameId = results[0].id;
        }
    }

    if (!igdbGameId) return null;

    // Step 2: Query gametimetobeats endpoint with game_id
    const ttbQuery = `fields hastily,normally,completely; where game_id = ${igdbGameId}; limit 1;`;
    const ttbResults = await igdbPost('game_time_to_beats', ttbQuery, clientId, accessToken);

    if (ttbResults && ttbResults.length > 0) {
        return extractTimeToBeat(ttbResults[0]);
    }

    return null;
}

/**
 * Reset the rate limiter (for testing).
 */
function _resetRateLimit() {
    lastRequestAt = 0;
}

module.exports = { fetchIgdbTimeToBeat, extractTimeToBeat, _resetRateLimit };
