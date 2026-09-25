import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Test locale detection logic.
 * Each test resets modules to re-run detectLocale() with fresh navigator/localStorage mocks.
 */

async function loadFreshModule() {
    vi.resetModules();
    return await import('../../i18n/index.js');
}

// In-memory localStorage mock
function createLocalStorageMock() {
    const store = {};
    return {
        getItem: (key) => store[key] ?? null,
        setItem: (key, val) => { store[key] = String(val); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    };
}

describe('detectLocale', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal('localStorage', createLocalStorageMock());
        vi.stubGlobal('navigator', { language: '' });
    });

    it('detects zh-CN from navigator.language', async () => {
        vi.stubGlobal('navigator', { language: 'zh-CN' });
        const { detectLocale } = await loadFreshModule();
        expect(detectLocale()).toBe('zh-CN');
    });

    it('detects zh-TW from navigator.language', async () => {
        vi.stubGlobal('navigator', { language: 'zh-TW' });
        const { detectLocale } = await loadFreshModule();
        expect(detectLocale()).toBe('zh-TW');
    });

    it('detects ja from navigator.language', async () => {
        vi.stubGlobal('navigator', { language: 'ja' });
        const { detectLocale } = await loadFreshModule();
        expect(detectLocale()).toBe('ja');
    });

    it('detects en from navigator.language en-US (base match)', async () => {
        vi.stubGlobal('navigator', { language: 'en-US' });
        const { detectLocale } = await loadFreshModule();
        expect(detectLocale()).toBe('en');
    });

    it('falls back to en for unsupported locale', async () => {
        vi.stubGlobal('navigator', { language: 'fr' });
        const { detectLocale } = await loadFreshModule();
        expect(detectLocale()).toBe('en');
    });

    it('falls back to en for empty navigator.language', async () => {
        vi.stubGlobal('navigator', { language: '' });
        const { detectLocale } = await loadFreshModule();
        expect(detectLocale()).toBe('en');
    });

    it('localStorage override takes priority over navigator', async () => {
        localStorage.setItem('maida_locale', 'ja');
        vi.stubGlobal('navigator', { language: 'zh-CN' });
        const { detectLocale } = await loadFreshModule();
        expect(detectLocale()).toBe('ja');
    });

    it('ignores invalid localStorage value', async () => {
        localStorage.setItem('maida_locale', 'invalid-locale');
        vi.stubGlobal('navigator', { language: 'zh-TW' });
        const { detectLocale } = await loadFreshModule();
        expect(detectLocale()).toBe('zh-TW');
    });

    it('ja-JP base match resolves to ja', async () => {
        vi.stubGlobal('navigator', { language: 'ja-JP' });
        const { detectLocale } = await loadFreshModule();
        expect(detectLocale()).toBe('ja');
    });

    it('en-GB base match resolves to en', async () => {
        vi.stubGlobal('navigator', { language: 'en-GB' });
        const { detectLocale } = await loadFreshModule();
        expect(detectLocale()).toBe('en');
    });

    it('fr falls back to en', async () => {
        vi.stubGlobal('navigator', { language: 'fr' });
        const { detectLocale } = await loadFreshModule();
        expect(detectLocale()).toBe('en');
    });

    // BUG-009: script/region-aware Chinese mapping.
    describe('BUG-009 zh script/region mapping', () => {
        it('zh-Hans resolves to zh-CN', async () => {
            vi.stubGlobal('navigator', { language: 'zh-Hans' });
            const { detectLocale } = await loadFreshModule();
            expect(detectLocale()).toBe('zh-CN');
        });

        it('zh-Hans-CN resolves to zh-CN', async () => {
            vi.stubGlobal('navigator', { language: 'zh-Hans-CN' });
            const { detectLocale } = await loadFreshModule();
            expect(detectLocale()).toBe('zh-CN');
        });

        it('zh-CN resolves to zh-CN', async () => {
            vi.stubGlobal('navigator', { language: 'zh-CN' });
            const { detectLocale } = await loadFreshModule();
            expect(detectLocale()).toBe('zh-CN');
        });

        it('zh-SG resolves to zh-CN', async () => {
            vi.stubGlobal('navigator', { language: 'zh-SG' });
            const { detectLocale } = await loadFreshModule();
            expect(detectLocale()).toBe('zh-CN');
        });

        it('zh-MY resolves to zh-CN', async () => {
            vi.stubGlobal('navigator', { language: 'zh-MY' });
            const { detectLocale } = await loadFreshModule();
            expect(detectLocale()).toBe('zh-CN');
        });

        it('zh-Hant resolves to zh-TW', async () => {
            vi.stubGlobal('navigator', { language: 'zh-Hant' });
            const { detectLocale } = await loadFreshModule();
            expect(detectLocale()).toBe('zh-TW');
        });

        it('zh-Hant-TW resolves to zh-TW', async () => {
            vi.stubGlobal('navigator', { language: 'zh-Hant-TW' });
            const { detectLocale } = await loadFreshModule();
            expect(detectLocale()).toBe('zh-TW');
        });

        it('zh-TW resolves to zh-TW', async () => {
            vi.stubGlobal('navigator', { language: 'zh-TW' });
            const { detectLocale } = await loadFreshModule();
            expect(detectLocale()).toBe('zh-TW');
        });

        it('zh-HK resolves to zh-TW', async () => {
            vi.stubGlobal('navigator', { language: 'zh-HK' });
            const { detectLocale } = await loadFreshModule();
            expect(detectLocale()).toBe('zh-TW');
        });

        it('zh-MO resolves to zh-TW', async () => {
            vi.stubGlobal('navigator', { language: 'zh-MO' });
            const { detectLocale } = await loadFreshModule();
            expect(detectLocale()).toBe('zh-TW');
        });

        it('bare zh keeps current default of zh-TW (no script/region evidence found)', async () => {
            vi.stubGlobal('navigator', { language: 'zh' });
            const { detectLocale } = await loadFreshModule();
            expect(detectLocale()).toBe('zh-TW');
        });
    });

    it('navigator.languages: first supported entry wins (fr, ja -> ja)', async () => {
        vi.stubGlobal('navigator', { language: 'fr', languages: ['fr', 'ja'] });
        const { detectLocale } = await loadFreshModule();
        expect(detectLocale()).toBe('ja');
    });
});
