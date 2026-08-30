/**
 * Maida 2.0 post-launch prescription picker.
 *
 * Pure: no Date/random inside — the caller supplies seedIndex.
 * Candidates: tier-2 catalog entries for the exact game slug first, then the
 * hand-curated generic allowlist below (filtered to ids present in the data).
 */

export const GENERIC_ALLOWLIST = [
    'no-optimization',
    'safe-exit',
    'partial-validity',
    'low-input',
    'tired-partial-capacity',
    'evening-entry',
    'late-night-entry',
    'survival-day',
    'short-burst',
    'generic-action',
];

/**
 * pickPostLaunch(prescriptions, { slug, seedIndex }) -> { list, pick }
 * prescriptions: { default: [...], catalog: { [slug]: [...] } } (tolerates absence)
 */
export function pickPostLaunch(prescriptions, { slug, seedIndex = 0 } = {}) {
    const defaults = prescriptions?.default || [];
    const catalog = prescriptions?.catalog || {};

    const gameEntries = (slug && catalog[slug]) || [];

    // The allowlist ids live across several groups (default, time-of-day,
    // emotional-states, catalog lists) — resolve against all of them, not
    // just prescriptions.default. First occurrence wins; defaults first.
    const byId = new Map();
    const addEntries = (entries) => {
        if (!Array.isArray(entries)) return;
        for (const p of entries) {
            if (p && p.id && !byId.has(p.id)) byId.set(p.id, p);
        }
    };
    addEntries(defaults);
    for (const group of Object.values(prescriptions || {})) {
        if (Array.isArray(group)) addEntries(group);
        else if (group && typeof group === 'object') Object.values(group).forEach(addEntries);
    }

    const gameIds = new Set(gameEntries.map(p => p?.id));
    const generics = GENERIC_ALLOWLIST
        .map(id => byId.get(id))
        .filter(p => p && !gameIds.has(p.id)); // no dupes when the slug's own catalog holds an allowlisted id

    const list = [...gameEntries, ...generics];
    if (list.length === 0) return { list, pick: null };

    const i = Number.isInteger(seedIndex) ? ((seedIndex % list.length) + list.length) % list.length : 0;
    return { list, pick: list[i] };
}
