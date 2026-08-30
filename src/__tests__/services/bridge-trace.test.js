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

describe('bridge.appendTrace', () => {
    it('invokes append_trace with the entry', async () => {
        const entry = { schemaVersion: 1, eventType: 'maida.hook.created' };
        invokeMock.mockResolvedValue({ success: true });
        await expect(bridge.appendTrace(entry)).resolves.toEqual({ success: true });
        expect(invokeMock).toHaveBeenCalledWith('append_trace', { entry });
    });

    it('propagates rejection instead of swallowing it into null', async () => {
        invokeMock.mockRejectedValue(new Error('disk full'));
        await expect(bridge.appendTrace({})).rejects.toThrow('disk full');
    });
});

describe('bridge.exportTrace', () => {
    it('invokes export_trace', async () => {
        invokeMock.mockResolvedValue('/path/to/trace.jsonl');
        await expect(bridge.exportTrace()).resolves.toBe('/path/to/trace.jsonl');
        expect(invokeMock).toHaveBeenCalledWith('export_trace', {});
    });

    it('degrades to null when invoke throws (call wrapper)', async () => {
        invokeMock.mockRejectedValue(new Error('no tauri runtime'));
        await expect(bridge.exportTrace()).resolves.toBeNull();
    });
});
