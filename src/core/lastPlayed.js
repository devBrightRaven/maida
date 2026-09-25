/**
 * LastPlayed data contract (P0-1) — single source of truth for interpreting
 * a game's Steam last-played state.
 *
 * Scope: `steamLastPlayed` / `steamLastPlayedStatus` (Steam ACF scan
 * pipeline) only. The legacy Playnite `lastPlayed` string pipeline
 * (normalize.js / engine.js / sort.js / stats.js) is out of scope.
 *
 * Never collapse missing / invalid / explicit-zero / legacy-unknown into
 * "never played" — only `recorded` and `zero` are proven facts from Steam.
 * Missing and invalid are "we don't know", not "the player never played".
 */

/**
 * Single validity rule, shared by every epoch check in this module and
 * mirrored by `compute_last_played` in src-tauri/src/steam/mod.rs (R1 fix):
 * a recordable epoch is an integer number of SECONDS, 0 < n <= MAX_EPOCH_SECONDS.
 *
 * MAX_EPOCH_SECONDS = 253402300799 (9999-12-31T23:59:59Z) — the conventional
 * "last representable 4-digit-year" bound used across ISO-8601 tooling, and
 * well inside Number.MAX_SAFE_INTEGER (9007199254740991), so integer
 * arithmetic on it never loses precision. It rejects pathological values
 * such as i64::MAX (9223372036854775807) that survive an `i64`/`> 0` check
 * but produce `new Date(n*1000)` = "Invalid Date".
 */
export const MAX_EPOCH_SECONDS = 253402300799;

function isValidEpochSeconds(epoch) {
    return typeof epoch === 'number'
        && Number.isFinite(epoch)
        && Number.isInteger(epoch)
        && epoch > 0
        && epoch <= MAX_EPOCH_SECONDS;
}

function isPositiveNumber(epoch) {
    return typeof epoch === 'number' && Number.isFinite(epoch) && epoch > 0;
}

/**
 * lastPlayedState(game) ->
 *   { kind: 'recorded', epoch }
 *   | { kind: 'zero' }
 *   | { kind: 'unknown', reason: 'missing' | 'invalid' | 'legacy' }
 *
 * `game.steamLastPlayedStatus` absent (legacy games.json written before this
 * contract existed) => unknown/legacy, EXCEPT `steamLastPlayed` passing the
 * validity rule above, which is still a real timestamp => recorded. A
 * legacy epoch that is positive but fails the rule (out of range,
 * non-integer) is unknown/invalid, not unknown/legacy — it is a known-bad
 * value, not merely an old record shape. Legacy 0 (or negative/NaN) is
 * never reinterpreted as `zero` — only an explicit "zero" status (a fresh
 * scan that saw the ACF field present and equal to 0) counts as a proven
 * zero, and only when its epoch actually is 0: a "zero" status paired with
 * a non-zero epoch is an inconsistent pairing, not a proven fact.
 */
export function lastPlayedState(game) {
    const status = game?.steamLastPlayedStatus;
    const epoch = game?.steamLastPlayed;
    const hasRecordedEpoch = isValidEpochSeconds(epoch);

    if (status === undefined) {
        if (hasRecordedEpoch) return { kind: 'recorded', epoch };
        if (isPositiveNumber(epoch)) return { kind: 'unknown', reason: 'invalid' };
        return { kind: 'unknown', reason: 'legacy' };
    }

    if (status === 'recorded') {
        // Defensive: a status claiming "recorded" without a usable epoch is
        // an inconsistent pairing, not a timestamp to trust.
        return hasRecordedEpoch ? { kind: 'recorded', epoch } : { kind: 'unknown', reason: 'invalid' };
    }

    if (status === 'zero') {
        // Defensive: a status claiming "zero" paired with a non-zero epoch
        // is an inconsistent pairing, not a proven zero.
        return epoch === 0 ? { kind: 'zero' } : { kind: 'unknown', reason: 'invalid' };
    }

    if (status === 'missing') {
        return { kind: 'unknown', reason: 'missing' };
    }

    // 'invalid' or any unrecognized status value.
    return { kind: 'unknown', reason: 'invalid' };
}

/**
 * formatLastPlayed(epoch, locale) -> string | null
 *
 * Steam ACF LastPlayed is always seconds (existing Rust fixtures, e.g.
 * "1724800000", are 10-digit second-scale values). The former `epoch > 1e12`
 * millisecond-tolerance branch is removed: it was never reachable from a
 * real Steam value, and it directly conflicted with the R1 bound rule (a
 * millisecond-scale epoch like 1700000000000 is far past MAX_EPOCH_SECONDS
 * and must now be rejected, not silently reinterpreted as milliseconds).
 * Rejects anything that fails the shared validity rule (returns null — the
 * unknown path) instead of formatting garbage or "Invalid Date". Callers
 * resolve zero/unknown via lastPlayedState() first; this only formats a
 * proven recorded timestamp.
 */
export function formatLastPlayed(epoch, locale) {
    if (!isValidEpochSeconds(epoch)) return null;
    return new Date(epoch * 1000).toLocaleDateString(locale);
}

/**
 * buildPlaytimeSnapshotPayload(games) -> { games: [{ id, steamLastPlayed, steamLastPlayedStatus }] }
 *
 * Pure. Builds the payload for the append-only `maida.playtime.snapshot`
 * trace event. Only installed games are included. `steamLastPlayed` is
 * `null` (never `|| 0`) whenever the state is not a proven recorded
 * timestamp, so unknown/invalid/missing/zero is never written into history
 * as a fabricated zero. `steamLastPlayedStatus` is passed through verbatim
 * (including `undefined` for legacy games with no status field at all) —
 * the trace records what the source actually said, nothing invented.
 */
export function buildPlaytimeSnapshotPayload(games) {
    const list = Array.isArray(games) ? games : [];
    return {
        games: list
            .filter(g => g && g.installed)
            .map(g => {
                const state = lastPlayedState(g);
                return {
                    id: String(g.id),
                    steamLastPlayed: state.kind === 'recorded' ? state.epoch : null,
                    steamLastPlayedStatus: g.steamLastPlayedStatus,
                };
            }),
    };
}
