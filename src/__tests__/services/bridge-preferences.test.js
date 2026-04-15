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

describe('bridge.getFrozenGuardDuration', () => {
    it('returns the number returned by Rust', async () => {
        invokeMock.mockResolvedValue(20);
        await expect(bridge.getFrozenGuardDuration()).resolves.toBe(20);
        expect(invokeMock).toHaveBeenCalledWith('get_frozen_guard_duration', {});
    });

    it('falls back to 15 when the invoke result is not a number', async () => {
        invokeMock.mockResolvedValue(null);
        await expect(bridge.getFrozenGuardDuration()).resolves.toBe(15);
    });

    it('falls back to 15 when invoke throws (graceful degrade)', async () => {
        invokeMock.mockRejectedValue(new Error('no tauri runtime'));
        await expect(bridge.getFrozenGuardDuration()).resolves.toBe(15);
    });
});

describe('bridge.setFrozenGuardDuration', () => {
    it('passes a valid integer through to invoke', async () => {
        invokeMock.mockResolvedValue({ success: true, seconds: 20 });
        const result = await bridge.setFrozenGuardDuration(20);
        expect(invokeMock).toHaveBeenCalledWith('set_frozen_guard_duration', { seconds: 20 });
        expect(result).toEqual({ success: true, seconds: 20 });
    });

    it('rounds fractional seconds to the nearest integer', async () => {
        invokeMock.mockResolvedValue({ success: true });
        await bridge.setFrozenGuardDuration(15.6);
        expect(invokeMock).toHaveBeenCalledWith('set_frozen_guard_duration', { seconds: 16 });
    });

    it('rejects values below the floor', async () => {
        await expect(bridge.setFrozenGuardDuration(4)).rejects.toThrow(/out of range/);
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('rejects values above the ceiling', async () => {
        await expect(bridge.setFrozenGuardDuration(31)).rejects.toThrow(/out of range/);
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('rejects non-numeric input', async () => {
        await expect(bridge.setFrozenGuardDuration('abc')).rejects.toThrow(/out of range/);
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('accepts boundary values 5 and 30', async () => {
        invokeMock.mockResolvedValue({ success: true });
        await bridge.setFrozenGuardDuration(5);
        await bridge.setFrozenGuardDuration(30);
        expect(invokeMock).toHaveBeenCalledTimes(2);
        expect(invokeMock).toHaveBeenNthCalledWith(1, 'set_frozen_guard_duration', { seconds: 5 });
        expect(invokeMock).toHaveBeenNthCalledWith(2, 'set_frozen_guard_duration', { seconds: 30 });
    });
});
