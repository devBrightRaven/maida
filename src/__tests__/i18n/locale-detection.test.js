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
});
