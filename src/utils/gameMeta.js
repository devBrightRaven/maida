/**
 * gameMeta — derives lightweight display metadata from a game object.
 *
 * Sources:
 *   - Duration:  game.igdb.timeToBeat (seconds) — populated by IGDB enrichment when credentials exist.
 *   - Size:      game.sizeOnDisk (bytes)          — populated from local Steam appmanifest during scan.
 *   - Recent:    game.reinstalledAt ?? game.importedAt — ISO 8601 date strings.
 *
 * All helpers return null / false when data is absent, so callers can
 * safely omit badges rather than showing empty or misleading information.
 */

const SECONDS_PER_HOUR = 3600;

// Duration thresholds (in seconds).
// < 3 h  → short  |  3–10 h → medium  |  ≥ 10 h → long
const DURATION_SHORT_MAX = 3 * SECONDS_PER_HOUR;
const DURATION_LONG_MIN = 10 * SECONDS_PER_HOUR;

// Size thresholds (in bytes).
// < 5 GB → small  |  5–20 GB → medium  |  ≥ 20 GB → large
const SIZE_SMALL_MAX = 5 * 1_000_000_000;
const SIZE_LARGE_MIN = 20 * 1_000_000_000;

// Default window for "recently added/reinstalled": 7 days.
export const DEFAULT_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Derive duration metadata from a game.
 *
 * @param {object} game
 * @returns {{ level: 'short'|'medium'|'long', display: string } | null}
 *   null when IGDB data is absent or incomplete.
 */
export function getDurationMeta(game) {
    const ttb = game?.igdb?.timeToBeat;
    if (!ttb) return null;

    // Prefer normally, fall back to hastily, then completely.
    const secs = ttb.normally ?? ttb.hastily ?? ttb.completely;
    if (secs == null || secs <= 0) return null;

    const level = secs < DURATION_SHORT_MAX ? 'short'
        : secs < DURATION_LONG_MIN ? 'medium'
        : 'long';

    const hours = Math.round(secs / SECONDS_PER_HOUR);
    const display = `~${hours}h`;

    return { level, display };
}

/**
 * Derive disk-footprint metadata from a game.
 *
 * @param {object} game
 * @returns {{ level: 'small'|'medium'|'large', display: string } | null}
 *   null when sizeOnDisk is absent or zero.
 */
export function getSizeMeta(game) {
    const bytes = game?.sizeOnDisk;
    if (bytes == null || bytes <= 0) return null;

    const level = bytes < SIZE_SMALL_MAX ? 'small'
        : bytes < SIZE_LARGE_MIN ? 'medium'
        : 'large';

    const gb = (bytes / 1_000_000_000).toFixed(1);
    const display = `${gb} GB`;

    return { level, display };
}

/**
 * Returns true when the game was imported or reinstalled within the given
 * time window (default 7 days).
 *
 * @param {object} game
 * @param {number} [windowMs]
 * @returns {boolean}
 */
export function isRecent(game, windowMs = DEFAULT_RECENT_WINDOW_MS) {
    const dateStr = game?.reinstalledAt ?? game?.importedAt;
    if (!dateStr) return false;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;

    return Date.now() - date.getTime() < windowMs;
}
