import { describe, it, expect } from 'vitest';
import { formatHltbTime } from '../../../electron/services/hltb.cjs';

describe('formatHltbTime', () => {
    it('formats integer hours', () => {
        expect(formatHltbTime(12)).toBe('~12 hrs');
    });

    it('rounds fractional hours', () => {
        expect(formatHltbTime(12.7)).toBe('~13 hrs');
        expect(formatHltbTime(12.2)).toBe('~12 hrs');
    });

    it('returns null for null input', () => {
        expect(formatHltbTime(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
        expect(formatHltbTime(undefined)).toBeNull();
    });

    it('returns null for zero', () => {
        expect(formatHltbTime(0)).toBeNull();
    });
});
