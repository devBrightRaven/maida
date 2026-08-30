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

describe('bridge.getArt', () => {
    it('passes appId and kind through to invoke and returns the data URL', async () => {
        invokeMock.mockResolvedValue('data:image/jpeg;base64,abc123');
        await expect(bridge.getArt('730', 'capsule')).resolves.toBe('data:image/jpeg;base64,abc123');
        expect(invokeMock).toHaveBeenCalledWith('get_art', { appId: '730', kind: 'capsule' });
    });

    it('fetches hero art with kind "hero"', async () => {
        invokeMock.mockResolvedValue('data:image/jpeg;base64,heroXYZ');
        await expect(bridge.getArt('730', 'hero')).resolves.toBe('data:image/jpeg;base64,heroXYZ');
        expect(invokeMock).toHaveBeenCalledWith('get_art', { appId: '730', kind: 'hero' });
    });

    it('resolves to null when no art is found (Ok(None))', async () => {
        invokeMock.mockResolvedValue(null);
        await expect(bridge.getArt('730', 'capsule')).resolves.toBeNull();
    });

    it('resolves to null when invoke rejects (graceful degrade)', async () => {
        invokeMock.mockRejectedValue(new Error('no tauri runtime'));
        await expect(bridge.getArt('730', 'capsule')).resolves.toBeNull();
    });

    it('resolves to null when the backend rejects an invalid kind', async () => {
        // Rust side returns Err(...) for any kind outside ["capsule", "hero"];
        // the call() wrapper catches it and degrades to null the same as any
        // other invoke failure.
        invokeMock.mockRejectedValue(new Error('invalid art kind: wallpaper (expected "capsule" or "hero")'));
        await expect(bridge.getArt('730', 'wallpaper')).resolves.toBeNull();
        expect(invokeMock).toHaveBeenCalledWith('get_art', { appId: '730', kind: 'wallpaper' });
    });
});
