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

describe('bridge.getGameMedia', () => {
    it('passes appId and lang through to invoke and returns the media info', async () => {
        const media = { screenshots: ['https://x/ss0.jpg'], movie: null };
        invokeMock.mockResolvedValue(media);
        await expect(bridge.getGameMedia('730', 'en')).resolves.toEqual(media);
        expect(invokeMock).toHaveBeenCalledWith('get_game_media', { appId: '730', lang: 'en' });
    });

    it('resolves to null when no media is available (Ok(None))', async () => {
        invokeMock.mockResolvedValue(null);
        await expect(bridge.getGameMedia('730', 'en')).resolves.toBeNull();
    });

    it('resolves to null when invoke rejects (graceful degrade)', async () => {
        invokeMock.mockRejectedValue(new Error('no tauri runtime'));
        await expect(bridge.getGameMedia('730', 'en')).resolves.toBeNull();
    });

    it('resolves to null when the backend rejects a malformed appId', async () => {
        invokeMock.mockRejectedValue(new Error('invalid appId'));
        await expect(bridge.getGameMedia('not-an-id', 'en')).resolves.toBeNull();
    });

    it('passes an hls_h264 manifest URL through untouched (bridge is a pure passthrough)', async () => {
        const media = {
            screenshots: ['https://x/ss0.jpg'],
            movie: { hls_h264: 'https://x/hls.m3u8', dash_h264: 'https://x/dash.mpd', mp4_480: null, mp4_max: null, thumbnail: 'https://x/movie.jpg' },
        };
        invokeMock.mockResolvedValue(media);
        await expect(bridge.getGameMedia('730', 'en')).resolves.toEqual(media);
    });
});

describe('bridge.getScreenshot', () => {
    it('passes appId and index through to invoke and returns the data URL', async () => {
        invokeMock.mockResolvedValue('data:image/jpeg;base64,abc123');
        await expect(bridge.getScreenshot('730', 0)).resolves.toBe('data:image/jpeg;base64,abc123');
        expect(invokeMock).toHaveBeenCalledWith('get_screenshot', { appId: '730', index: 0 });
    });

    it('resolves to null when the index has no screenshot (Ok(None))', async () => {
        invokeMock.mockResolvedValue(null);
        await expect(bridge.getScreenshot('730', 3)).resolves.toBeNull();
    });

    it('resolves to null when invoke rejects (graceful degrade)', async () => {
        invokeMock.mockRejectedValue(new Error('no tauri runtime'));
        await expect(bridge.getScreenshot('730', 0)).resolves.toBeNull();
    });

    it('resolves to null when the backend rejects an out-of-range index', async () => {
        invokeMock.mockRejectedValue(new Error('invalid screenshot index: 9 (expected 0..4)'));
        await expect(bridge.getScreenshot('730', 9)).resolves.toBeNull();
    });
});
