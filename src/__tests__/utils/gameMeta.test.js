import { describe, it, expect } from 'vitest';
import { getDurationMeta, getSizeMeta, isRecent, DEFAULT_RECENT_WINDOW_MS } from '../../utils/gameMeta';

// ──────────────────────────────────────────────────────
// getDurationMeta
// ──────────────────────────────────────────────────────

describe('getDurationMeta', () => {
    it('returns null when game has no igdb data', () => {
        expect(getDurationMeta({})).toBeNull();
        expect(getDurationMeta({ igdb: {} })).toBeNull();
        expect(getDurationMeta(null)).toBeNull();
        expect(getDurationMeta(undefined)).toBeNull();
    });

    it('returns null when timeToBeat exists but all fields are null', () => {
        const game = { igdb: { timeToBeat: { hastily: null, normally: null, completely: null } } };
        expect(getDurationMeta(game)).toBeNull();
    });

    it('returns null when timeToBeat.normally is zero or negative', () => {
        expect(getDurationMeta({ igdb: { timeToBeat: { normally: 0 } } })).toBeNull();
        expect(getDurationMeta({ igdb: { timeToBeat: { normally: -100 } } })).toBeNull();
    });

    it('classifies < 3 h as short', () => {
        // 1.5 hours = 5400s
        const game = { igdb: { timeToBeat: { normally: 5400 } } };
        const result = getDurationMeta(game);
        expect(result).not.toBeNull();
        expect(result.level).toBe('short');
        expect(result.display).toBe('~2h');
    });

    it('classifies exactly 3 h as medium (boundary)', () => {
        const game = { igdb: { timeToBeat: { normally: 3 * 3600 } } };
        const result = getDurationMeta(game);
        expect(result.level).toBe('medium');
    });

    it('classifies 8 h as medium', () => {
        const game = { igdb: { timeToBeat: { normally: 8 * 3600 } } };
        const result = getDurationMeta(game);
        expect(result.level).toBe('medium');
        expect(result.display).toBe('~8h');
    });

    it('classifies exactly 10 h as long (boundary)', () => {
        const game = { igdb: { timeToBeat: { normally: 10 * 3600 } } };
        const result = getDurationMeta(game);
        expect(result.level).toBe('long');
    });

    it('classifies 60 h as long', () => {
        const game = { igdb: { timeToBeat: { normally: 60 * 3600 } } };
        const result = getDurationMeta(game);
        expect(result.level).toBe('long');
        expect(result.display).toBe('~60h');
    });

    it('falls back to hastily when normally is null', () => {
        const game = { igdb: { timeToBeat: { hastily: 2 * 3600, normally: null } } };
        const result = getDurationMeta(game);
        expect(result).not.toBeNull();
        expect(result.level).toBe('short');
    });

    it('falls back to completely when normally and hastily are null', () => {
        const game = { igdb: { timeToBeat: { hastily: null, normally: null, completely: 25 * 3600 } } };
        const result = getDurationMeta(game);
        expect(result).not.toBeNull();
        expect(result.level).toBe('long');
    });

    it('prefers normally over hastily when both are present', () => {
        // normally puts it in "medium", hastily would put it in "short"
        const game = { igdb: { timeToBeat: { hastily: 1 * 3600, normally: 5 * 3600 } } };
        const result = getDurationMeta(game);
        expect(result.level).toBe('medium');
    });
});

// ──────────────────────────────────────────────────────
// getSizeMeta
// ──────────────────────────────────────────────────────

describe('getSizeMeta', () => {
    it('returns null when sizeOnDisk is absent', () => {
        expect(getSizeMeta({})).toBeNull();
        expect(getSizeMeta(null)).toBeNull();
        expect(getSizeMeta(undefined)).toBeNull();
    });

    it('returns null when sizeOnDisk is zero', () => {
        expect(getSizeMeta({ sizeOnDisk: 0 })).toBeNull();
    });

    it('returns null when sizeOnDisk is negative', () => {
        expect(getSizeMeta({ sizeOnDisk: -1 })).toBeNull();
    });

    it('classifies < 5 GB as small', () => {
        // 2 GB = 2_000_000_000 bytes
        const game = { sizeOnDisk: 2_000_000_000 };
        const result = getSizeMeta(game);
        expect(result).not.toBeNull();
        expect(result.level).toBe('small');
        expect(result.display).toBe('2.0 GB');
    });

    it('classifies exactly 5 GB as medium (boundary)', () => {
        const game = { sizeOnDisk: 5_000_000_000 };
        const result = getSizeMeta(game);
        expect(result.level).toBe('medium');
    });

    it('classifies 12 GB as medium', () => {
        const game = { sizeOnDisk: 12_000_000_000 };
        const result = getSizeMeta(game);
        expect(result.level).toBe('medium');
        expect(result.display).toBe('12.0 GB');
    });

    it('classifies exactly 20 GB as large (boundary)', () => {
        const game = { sizeOnDisk: 20_000_000_000 };
        const result = getSizeMeta(game);
        expect(result.level).toBe('large');
    });

    it('classifies 80 GB as large', () => {
        const game = { sizeOnDisk: 80_000_000_000 };
        const result = getSizeMeta(game);
        expect(result.level).toBe('large');
        expect(result.display).toBe('80.0 GB');
    });

    it('formats fractional GB with one decimal place', () => {
        // 4.5 GB
        const game = { sizeOnDisk: 4_500_000_000 };
        const result = getSizeMeta(game);
        expect(result.display).toBe('4.5 GB');
    });
});

// ──────────────────────────────────────────────────────
// isRecent
// ──────────────────────────────────────────────────────

describe('isRecent', () => {
    it('returns false when game has no date fields', () => {
        expect(isRecent({})).toBe(false);
        expect(isRecent(null)).toBe(false);
        expect(isRecent(undefined)).toBe(false);
    });

    it('returns false when date string is invalid', () => {
        expect(isRecent({ importedAt: 'not-a-date' })).toBe(false);
    });

    it('returns true when importedAt is within the default window', () => {
        const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
        expect(isRecent({ importedAt: recent })).toBe(true);
    });

    it('returns false when importedAt is outside the default window', () => {
        const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
        expect(isRecent({ importedAt: old })).toBe(false);
    });

    it('prefers reinstalledAt over importedAt when both are present', () => {
        const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
        const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
        // reinstalledAt is recent → true
        expect(isRecent({ importedAt: old, reinstalledAt: recent })).toBe(true);
        // reinstalledAt is old → false, even though importedAt might be recent
        expect(isRecent({ importedAt: recent, reinstalledAt: old })).toBe(false);
    });

    it('respects a custom windowMs', () => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        // Within 2-hour window
        expect(isRecent({ importedAt: oneHourAgo }, 2 * 60 * 60 * 1000)).toBe(true);
        // Outside 30-minute window
        expect(isRecent({ importedAt: oneHourAgo }, 30 * 60 * 1000)).toBe(false);
    });

    it('returns false exactly at the boundary (equal to windowMs)', () => {
        const exactBoundary = new Date(Date.now() - DEFAULT_RECENT_WINDOW_MS).toISOString();
        // Date.now() - boundary === windowMs is NOT < windowMs, so false
        expect(isRecent({ importedAt: exactBoundary })).toBe(false);
    });
});
