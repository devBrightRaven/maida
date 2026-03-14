const https = require('https');

// In-memory token cache
let tokenCache = { accessToken: null, expiresAt: 0 };

/**
 * Request a new app access token from Twitch OAuth.
 * Uses Client Credentials flow (no user login required).
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Promise<{accessToken: string, expiresIn: number}|null>}
 */
async function getAccessToken(clientId, clientSecret) {
    if (!clientId || !clientSecret) {
        console.warn('[Twitch] Missing clientId or clientSecret');
        return null;
    }

    const postData = `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;

    return new Promise((resolve) => {
        const req = https.request(
            {
                hostname: 'id.twitch.tv',
                path: '/oauth2/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData),
                },
            },
            (res) => {
                let body = '';
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            console.warn(`[Twitch] OAuth returned ${res.statusCode}: ${body}`);
                            resolve(null);
                            return;
                        }
                        const data = JSON.parse(body);
                        if (!data.access_token) {
                            console.warn('[Twitch] No access_token in response');
                            resolve(null);
                            return;
                        }
                        resolve({
                            accessToken: data.access_token,
                            expiresIn: data.expires_in || 0,
                        });
                    } catch (e) {
                        console.warn('[Twitch] Failed to parse OAuth response:', e.message);
                        resolve(null);
                    }
                });
            }
        );

        req.on('error', (e) => {
            console.warn('[Twitch] OAuth request failed:', e.message);
            resolve(null);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Return a valid access token, refreshing if expired or missing.
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Promise<string|null>}
 */
async function refreshIfExpired(clientId, clientSecret) {
    const now = Date.now();
    if (tokenCache.accessToken && tokenCache.expiresAt > now) {
        return tokenCache.accessToken;
    }

    const result = await getAccessToken(clientId, clientSecret);
    if (!result) {
        tokenCache = { accessToken: null, expiresAt: 0 };
        return null;
    }

    // Expire 60 seconds early to avoid edge-case failures
    tokenCache = {
        accessToken: result.accessToken,
        expiresAt: now + result.expiresIn * 1000 - 60_000,
    };

    return tokenCache.accessToken;
}

/**
 * Clear the in-memory token cache (for testing or credential change).
 */
function clearTokenCache() {
    tokenCache = { accessToken: null, expiresAt: 0 };
}

// Expose internals for testing
function _getTokenCache() {
    return { ...tokenCache };
}

module.exports = { getAccessToken, refreshIfExpired, clearTokenCache, _getTokenCache };
