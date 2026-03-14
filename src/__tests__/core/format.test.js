import { describe, it, expect } from 'vitest';
import { formatPlaytime } from '../../core/format';

describe('formatPlaytime', () => {
    it('returns null for null input', () => {
        expect(formatPlaytime(null)).toBe(null);
    });

    it('returns null for undefined input', () => {
        expect(formatPlaytime(undefined)).toBe(null);
    });

    it('returns null for 0 seconds', () => {
        expect(formatPlaytime(0)).toBe(null);
    });

    it('returns "1h" for 3600 seconds (exact hour)', () => {
        expect(formatPlaytime(3600)).toBe('1h');
    });

    it('returns "1h 30m" for 5400 seconds (hour + minutes)', () => {
        expect(formatPlaytime(5400)).toBe('1h 30m');
    });

    it('returns "2h" for 7200 seconds (exact hours)', () => {
        expect(formatPlaytime(7200)).toBe('2h');
    });

    it('returns minutes only for sub-hour values', () => {
        expect(formatPlaytime(1800)).toBe('30m');
    });

    it('returns null for negative values', () => {
        expect(formatPlaytime(-100)).toBe(null);
    });
});
