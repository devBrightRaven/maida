import { describe, it, expect } from 'vitest';
import {
    validateKeyFormat,
    formatLicenseKey,
    isKataUnlocked,
} from '../../core/license.js';

describe('validateKeyFormat', () => {
    it('accepts valid key', () => {
        expect(validateKeyFormat('MAIDA-ABCDE-12345-FGHIJ')).toBe(true);
    });

    it('accepts lowercase (normalizes)', () => {
        expect(validateKeyFormat('maida-abcde-12345-fghij')).toBe(true);
    });

    it('accepts with leading/trailing whitespace', () => {
        expect(validateKeyFormat('  MAIDA-ABCDE-12345-FGHIJ  ')).toBe(true);
    });

    it('rejects wrong prefix', () => {
        expect(validateKeyFormat('WRONG-ABCDE-12345-FGHIJ')).toBe(false);
    });

    it('rejects too short', () => {
        expect(validateKeyFormat('MAIDA-ABC')).toBe(false);
    });

    it('rejects too long', () => {
        expect(validateKeyFormat('MAIDA-ABCDE-12345-FGHIJ-EXTRA')).toBe(false);
    });

    it('rejects missing dashes', () => {
        expect(validateKeyFormat('MAIDAABCDE12345FGHIJ')).toBe(false);
    });

    it('rejects special characters', () => {
        expect(validateKeyFormat('MAIDA-ABC!E-12345-FGHIJ')).toBe(false);
    });

    it('rejects null/undefined/empty', () => {
        expect(validateKeyFormat(null)).toBe(false);
        expect(validateKeyFormat(undefined)).toBe(false);
        expect(validateKeyFormat('')).toBe(false);
    });

    it('rejects non-string', () => {
        expect(validateKeyFormat(12345)).toBe(false);
    });
});

describe('formatLicenseKey', () => {
    it('formats raw alphanumeric input', () => {
        expect(formatLicenseKey('MAIDAABCDE12345FGHIJ')).toBe('MAIDA-ABCDE-12345-FGHIJ');
    });

    it('handles lowercase', () => {
        expect(formatLicenseKey('maidaabcde12345fghij')).toBe('MAIDA-ABCDE-12345-FGHIJ');
    });

    it('strips non-alphanumeric characters', () => {
        expect(formatLicenseKey('MAIDA-ABC-DE-123-45-FGH-IJ')).toBe('MAIDA-ABCDE-12345-FGHIJ');
    });

    it('returns empty for null/undefined', () => {
        expect(formatLicenseKey(null)).toBe('');
        expect(formatLicenseKey(undefined)).toBe('');
        expect(formatLicenseKey('')).toBe('');
    });
});

describe('isKataUnlocked', () => {
    it('returns true when licensed', () => {
        expect(isKataUnlocked({ licensed: true })).toBe(true);
    });

    it('returns false when not licensed', () => {
        expect(isKataUnlocked({ licensed: false })).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(isKataUnlocked(null)).toBe(false);
        expect(isKataUnlocked(undefined)).toBe(false);
        expect(isKataUnlocked({})).toBe(false);
    });
});
