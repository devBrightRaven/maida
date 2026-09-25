import { describe, it, expect } from 'vitest';
import { lastPlayedState, formatLastPlayed, buildPlaytimeSnapshotPayload, MAX_EPOCH_SECONDS } from '../../core/lastPlayed.js';

// i64::MAX as a JS number. Cannot be represented exactly (rounds in the
// float64 domain) but that is irrelevant to this fix: it is positive and
// vastly exceeds MAX_EPOCH_SECONDS either way, so it must be rejected.
// Built via Number(string) rather than a numeric literal to avoid
// eslint(no-loss-of-precision), which flags literals that cannot round-trip.
const I64_MAX_AS_NUMBER = Number('9223372036854775807');

// LastPlayed data contract (P0-1): missing / invalid / explicit-zero / valid
// timestamps must stay distinguishable end to end. Maida must not show
// unknown data as "never played".
describe('lastPlayedState', () => {
    it('recorded: field present, parsed, > 0', () => {
        expect(lastPlayedState({ steamLastPlayed: 1700000000, steamLastPlayedStatus: 'recorded' }))
            .toEqual({ kind: 'recorded', epoch: 1700000000 });
    });

    it('zero: field present, parsed, == 0 — not proof the player never played', () => {
        expect(lastPlayedState({ steamLastPlayed: 0, steamLastPlayedStatus: 'zero' }))
            .toEqual({ kind: 'zero' });
    });

    it('missing: field absent from the ACF', () => {
        expect(lastPlayedState({ steamLastPlayed: 0, steamLastPlayedStatus: 'missing' }))
            .toEqual({ kind: 'unknown', reason: 'missing' });
    });

    it('invalid: present but not a parseable integer, or negative', () => {
        expect(lastPlayedState({ steamLastPlayed: 0, steamLastPlayedStatus: 'invalid' }))
            .toEqual({ kind: 'unknown', reason: 'invalid' });
    });

    it('legacy-without-status with steamLastPlayed 0: unknown/legacy, never reinterpreted as zero', () => {
        expect(lastPlayedState({ steamLastPlayed: 0 }))
            .toEqual({ kind: 'unknown', reason: 'legacy' });
    });

    it('legacy-without-status with steamLastPlayed > 0: still a real timestamp, recorded', () => {
        expect(lastPlayedState({ steamLastPlayed: 1650000000 }))
            .toEqual({ kind: 'recorded', epoch: 1650000000 });
    });

    it('mixed list: maps every shape to its correct kind', () => {
        const games = [
            { id: 'a', steamLastPlayed: 1700000000, steamLastPlayedStatus: 'recorded' },
            { id: 'b', steamLastPlayed: 0, steamLastPlayedStatus: 'zero' },
            { id: 'c', steamLastPlayed: 0, steamLastPlayedStatus: 'missing' },
            { id: 'd', steamLastPlayed: 0, steamLastPlayedStatus: 'invalid' },
            { id: 'e', steamLastPlayed: 0 }, // legacy, no status, explicit 0
            { id: 'f', steamLastPlayed: 1650000000 }, // legacy, no status, real timestamp
        ];
        expect(games.map(g => ({ id: g.id, state: lastPlayedState(g) }))).toEqual([
            { id: 'a', state: { kind: 'recorded', epoch: 1700000000 } },
            { id: 'b', state: { kind: 'zero' } },
            { id: 'c', state: { kind: 'unknown', reason: 'missing' } },
            { id: 'd', state: { kind: 'unknown', reason: 'invalid' } },
            { id: 'e', state: { kind: 'unknown', reason: 'legacy' } },
            { id: 'f', state: { kind: 'recorded', epoch: 1650000000 } },
        ]);
    });

    it('treats a missing game object as unknown/legacy rather than throwing', () => {
        expect(lastPlayedState(undefined)).toEqual({ kind: 'unknown', reason: 'legacy' });
        expect(lastPlayedState(null)).toEqual({ kind: 'unknown', reason: 'legacy' });
    });

    it('falls back to unknown/invalid when status claims recorded but the epoch is unusable', () => {
        expect(lastPlayedState({ steamLastPlayed: 0, steamLastPlayedStatus: 'recorded' }))
            .toEqual({ kind: 'unknown', reason: 'invalid' });
    });

    // R1: a positive but unusable epoch (i64::MAX, out-of-range values) must
    // never be treated as a recorded timestamp, regardless of status shape.
    it('R1: status recorded + i64::MAX epoch -> unknown/invalid, not recorded', () => {
        expect(lastPlayedState({ steamLastPlayed: I64_MAX_AS_NUMBER, steamLastPlayedStatus: 'recorded' }))
            .toEqual({ kind: 'unknown', reason: 'invalid' });
    });

    it('R1: legacy (no status) + i64::MAX epoch -> unknown/invalid, not recorded or legacy', () => {
        expect(lastPlayedState({ steamLastPlayed: I64_MAX_AS_NUMBER }))
            .toEqual({ kind: 'unknown', reason: 'invalid' });
    });

    it('R1: legacy epoch one past MAX_EPOCH_SECONDS -> unknown/invalid', () => {
        expect(lastPlayedState({ steamLastPlayed: MAX_EPOCH_SECONDS + 1 }))
            .toEqual({ kind: 'unknown', reason: 'invalid' });
    });

    it('R1: epoch exactly at MAX_EPOCH_SECONDS -> recorded', () => {
        expect(lastPlayedState({ steamLastPlayed: MAX_EPOCH_SECONDS }))
            .toEqual({ kind: 'recorded', epoch: MAX_EPOCH_SECONDS });
    });

    it('R1: NaN epoch with no status -> unknown/legacy (not positive)', () => {
        expect(lastPlayedState({ steamLastPlayed: NaN })).toEqual({ kind: 'unknown', reason: 'legacy' });
    });

    it('R1: non-integer epoch (1.5) with no status -> unknown/invalid', () => {
        expect(lastPlayedState({ steamLastPlayed: 1.5 })).toEqual({ kind: 'unknown', reason: 'invalid' });
    });

    it('R1: status zero paired with a non-zero epoch -> unknown/invalid (inconsistent pair)', () => {
        expect(lastPlayedState({ steamLastPlayed: 1700000000, steamLastPlayedStatus: 'zero' }))
            .toEqual({ kind: 'unknown', reason: 'invalid' });
    });
});

describe('formatLastPlayed', () => {
    it('formats a positive epoch (seconds) as a locale date string', () => {
        const result = formatLastPlayed(1700000000, 'en-US');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    it('rejects zero (the unknown path, not a date)', () => {
        expect(formatLastPlayed(0, 'en-US')).toBeNull();
    });

    it('rejects a negative epoch', () => {
        expect(formatLastPlayed(-100, 'en-US')).toBeNull();
    });

    it('rejects non-finite input', () => {
        expect(formatLastPlayed(NaN, 'en-US')).toBeNull();
        expect(formatLastPlayed(Infinity, 'en-US')).toBeNull();
        expect(formatLastPlayed(undefined, 'en-US')).toBeNull();
    });

    // R1: the seconds-only bound rule replaces the former ms-tolerance
    // branch. Steam ACF LastPlayed is always seconds (10-digit values in
    // both the Rust fixtures and these tests, e.g. 1700000000); a
    // millisecond-scale number like 1700000000000 is now far past
    // MAX_EPOCH_SECONDS and must be rejected, not silently reinterpreted.
    it('R1: rejects i64::MAX — never renders "Invalid Date"', () => {
        expect(formatLastPlayed(I64_MAX_AS_NUMBER, 'en-US')).toBeNull();
    });

    it('R1: rejects an epoch one past MAX_EPOCH_SECONDS (formerly ms-scale territory)', () => {
        expect(formatLastPlayed(MAX_EPOCH_SECONDS + 1, 'en-US')).toBeNull();
    });

    it('R1: rejects a millisecond-scale value that used to be tolerated', () => {
        expect(formatLastPlayed(1700000000000, 'en-US')).toBeNull();
    });

    it('R1: accepts an epoch exactly at MAX_EPOCH_SECONDS', () => {
        const result = formatLastPlayed(MAX_EPOCH_SECONDS, 'en-US');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    it('R1: rejects a non-integer epoch (1.5)', () => {
        expect(formatLastPlayed(1.5, 'en-US')).toBeNull();
    });
});

describe('buildPlaytimeSnapshotPayload', () => {
    it('includes only installed games', () => {
        const games = [
            { id: 'a', installed: true, steamLastPlayed: 100, steamLastPlayedStatus: 'recorded' },
            { id: 'b', installed: false, steamLastPlayed: 200, steamLastPlayedStatus: 'recorded' },
        ];
        expect(buildPlaytimeSnapshotPayload(games).games.map(g => g.id)).toEqual(['a']);
    });

    it('emits steamLastPlayed as the epoch when recorded', () => {
        const games = [{ id: 'a', installed: true, steamLastPlayed: 1700000000, steamLastPlayedStatus: 'recorded' }];
        expect(buildPlaytimeSnapshotPayload(games).games[0])
            .toEqual({ id: 'a', steamLastPlayed: 1700000000, steamLastPlayedStatus: 'recorded' });
    });

    it('emits null (never || 0) for zero, missing, invalid, and legacy games', () => {
        const games = [
            { id: 'zero', installed: true, steamLastPlayed: 0, steamLastPlayedStatus: 'zero' },
            { id: 'missing', installed: true, steamLastPlayed: 0, steamLastPlayedStatus: 'missing' },
            { id: 'invalid', installed: true, steamLastPlayed: 0, steamLastPlayedStatus: 'invalid' },
            { id: 'legacy', installed: true, steamLastPlayed: 0 },
        ];
        const payload = buildPlaytimeSnapshotPayload(games);
        expect(payload.games.every(g => g.steamLastPlayed === null)).toBe(true);
    });

    it('passes steamLastPlayedStatus through as-is, including undefined for legacy games', () => {
        const games = [{ id: 'legacy', installed: true, steamLastPlayed: 0 }];
        expect(buildPlaytimeSnapshotPayload(games).games[0].steamLastPlayedStatus).toBeUndefined();
    });

    it('tolerates missing/non-array input', () => {
        expect(buildPlaytimeSnapshotPayload(undefined)).toEqual({ games: [] });
        expect(buildPlaytimeSnapshotPayload(null)).toEqual({ games: [] });
    });

    // R1: an i64::MAX (or otherwise unusable) epoch must never be serialized
    // into the append-only trace as a numeric timestamp.
    it('R1: emits null for an i64::MAX epoch, whatever status accompanies it', () => {
        const games = [
            { id: 'a', installed: true, steamLastPlayed: I64_MAX_AS_NUMBER, steamLastPlayedStatus: 'recorded' },
            { id: 'b', installed: true, steamLastPlayed: I64_MAX_AS_NUMBER },
        ];
        const payload = buildPlaytimeSnapshotPayload(games);
        expect(payload.games.every(g => g.steamLastPlayed === null)).toBe(true);
    });

    it('R1: JSON.stringify round-trip never carries an unusable epoch as a number', () => {
        const games = [
            { id: 'a', installed: true, steamLastPlayed: 1700000000, steamLastPlayedStatus: 'recorded' },
            { id: 'b', installed: true, steamLastPlayed: I64_MAX_AS_NUMBER, steamLastPlayedStatus: 'recorded' },
        ];
        const payload = buildPlaytimeSnapshotPayload(games);
        const roundTripped = JSON.parse(JSON.stringify(payload));
        expect(roundTripped).toEqual(payload);
        expect(roundTripped.games.find(g => g.id === 'a').steamLastPlayed).toBe(1700000000);
        expect(roundTripped.games.find(g => g.id === 'b').steamLastPlayed).toBeNull();
    });
});
