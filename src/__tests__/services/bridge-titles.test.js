import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Tauri IPC so tests can run in plain Node without a webview.
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
    invoke: (...args) => invokeMock(...args),
}));

// Dynamic import so the mock applies before bridge.js loads.
let bridge;
beforeEach(async () => {
    invokeMock.mockReset();
    vi.resetModules();
    bridge = (await import('../../services/bridge')).default;
});

describe('bridge.getLocalizedTitles', () => {
    it('passes appIds and lang through to invoke and returns the map', async () => {
        invokeMock.mockResolvedValue({ '730': '測試遊戲' });
        await expect(bridge.getLocalizedTitles(['730'], 'zh-TW')).resolves.toEqual({ '730': '測試遊戲' });
        expect(invokeMock).toHaveBeenCalledWith('get_localized_titles', { appIds: ['730'], lang: 'zh-TW' });
    });

    it('resolves to null when invoke rejects (graceful degrade, Maida2View falls back to game.title)', async () => {
        invokeMock.mockRejectedValue(new Error('no tauri runtime'));
        await expect(bridge.getLocalizedTitles(['730'], 'zh-TW')).resolves.toBeNull();
    });

    it('resolves to an empty object when no requested appId has a name in that lang', async () => {
        invokeMock.mockResolvedValue({});
        await expect(bridge.getLocalizedTitles(['999999'], 'ja')).resolves.toEqual({});
    });
});
