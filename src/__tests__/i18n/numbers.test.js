import { describe, it, expect } from 'vitest';
import { secondsToWord } from '../../i18n/numbers';

describe('secondsToWord', () => {
    it('returns the spelled-out form for 0..15 in English', () => {
        expect(secondsToWord(0, 'en')).toBe('zero');
        expect(secondsToWord(3, 'en')).toBe('three');
        expect(secondsToWord(15, 'en')).toBe('fifteen');
    });

    it('covers the new 16..30 range in English', () => {
        expect(secondsToWord(16, 'en')).toBe('sixteen');
        expect(secondsToWord(20, 'en')).toBe('twenty');
        expect(secondsToWord(25, 'en')).toBe('twenty-five');
        expect(secondsToWord(30, 'en')).toBe('thirty');
    });

    it('covers 0..30 in Traditional Chinese', () => {
        expect(secondsToWord(0, 'zh-TW')).toBe('零');
        expect(secondsToWord(15, 'zh-TW')).toBe('十五');
        expect(secondsToWord(20, 'zh-TW')).toBe('二十');
        expect(secondsToWord(30, 'zh-TW')).toBe('三十');
    });

    it('covers 0..30 in Simplified Chinese', () => {
        expect(secondsToWord(10, 'zh-CN')).toBe('十');
        expect(secondsToWord(25, 'zh-CN')).toBe('二十五');
        expect(secondsToWord(30, 'zh-CN')).toBe('三十');
    });

    it('covers 0..30 in Japanese', () => {
        expect(secondsToWord(5, 'ja')).toBe('五');
        expect(secondsToWord(18, 'ja')).toBe('十八');
        expect(secondsToWord(30, 'ja')).toBe('三十');
    });

    it('falls back to digit string for out-of-range values', () => {
        expect(secondsToWord(31, 'en')).toBe('31');
        expect(secondsToWord(100, 'zh-TW')).toBe('100');
        expect(secondsToWord(-1, 'ja')).toBe('-1');
    });

    it('falls back to English for unknown locales', () => {
        expect(secondsToWord(7, 'de')).toBe('seven');
        expect(secondsToWord(20, 'fr')).toBe('twenty');
    });

    it('has same array length across all locales', () => {
        // All 4 locales must support the same numeric range for parity.
        const probe = [0, 10, 15, 16, 20, 25, 30];
        for (const n of probe) {
            const en = secondsToWord(n, 'en');
            const tw = secondsToWord(n, 'zh-TW');
            const cn = secondsToWord(n, 'zh-CN');
            const ja = secondsToWord(n, 'ja');
            // All should return a word (not a digit fallback) for 0..30
            expect(en).not.toBe(String(n));
            expect(tw).not.toBe(String(n));
            expect(cn).not.toBe(String(n));
            expect(ja).not.toBe(String(n));
        }
    });
});
