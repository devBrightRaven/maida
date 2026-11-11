/**
 * The Decision Trace subject for a game: { namespace, id }.
 *
 * A record carries a stored `traceSubject` once it has more than one install
 * (or was created by a non-Steam intake path). That stored value wins, so a
 * Steam install attached later never moves the game's history to a new
 * subject. Without one, the subject is derived exactly as before:
 * `steamAppId != null` gives `steam` + appid, otherwise `maida` + record id.
 *
 * Keep in step with `derive_trace_subject` in src-tauri/src/library.rs.
 */
export function traceSubjectOf(game) {
    if (!game) return null;
    const stored = game.traceSubject;
    if (
        stored &&
        typeof stored.namespace === 'string' && stored.namespace !== '' &&
        stored.id != null && String(stored.id) !== ''
    ) {
        return { namespace: stored.namespace, id: String(stored.id) };
    }
    return game.steamAppId != null
        ? { namespace: 'steam', id: String(game.steamAppId) }
        : { namespace: 'maida', id: String(game.id) };
}
