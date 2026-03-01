/**
 * Constraints Layer — Pre-engine friction elimination.
 *
 * Constraints ONLY eliminate friction.
 * Constraints NEVER optimize choice.
 * Constraints NEVER reduce agency.
 *
 * Applied BEFORE getActiveGame() in the evaluation pipeline:
 *   games.json → applyConstraints() → getActiveGame() → getPrescription()
 */

const DEFAULT_CONSTRAINTS = {
    installed_only: true,
    exclude_vr_only: false,
    exclude_appids: [],
    exclude_family_share: false
};

/**
 * Apply constraints to filter the games pool.
 * Only eliminates games that match hard-exclusion criteria.
 *
 * @param {Object} gamesData - { games: [...], ...metadata }
 * @param {Object|null} constraints - { exclude_appids: string[], ... }
 * @returns {Object} - New gamesData with excluded games removed
 */
export function applyConstraints(gamesData, constraints) {
    if (!gamesData?.games || !constraints) return gamesData;

    const excludeSet = new Set(constraints.exclude_appids || []);
    if (excludeSet.size === 0) return gamesData;

    return {
        ...gamesData,
        games: gamesData.games.filter(g => !excludeSet.has(g.steamAppId))
    };
}

export { DEFAULT_CONSTRAINTS };
