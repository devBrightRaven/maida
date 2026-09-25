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

describe('bridge.getMaida2PlayDelaySeconds', () => {
    it('returns 3 when Rust returns 3', async () => {
        invokeMock.mockResolvedValue(3);
        await expect(bridge.getMaida2PlayDelaySeconds()).resolves.toBe(3);
        expect(invokeMock).toHaveBeenCalledWith('get_maida2_play_delay_seconds', {});
    });

    it('returns 5 when Rust returns 5', async () => {
        invokeMock.mockResolvedValue(5);
        await expect(bridge.getMaida2PlayDelaySeconds()).resolves.toBe(5);
    });

    it('falls back to 5 for any value outside {3, 5}', async () => {
        invokeMock.mockResolvedValue(4);
        await expect(bridge.getMaida2PlayDelaySeconds()).resolves.toBe(5);
    });

    it('falls back to 5 when invoke throws (graceful degrade)', async () => {
        invokeMock.mockRejectedValue(new Error('no tauri runtime'));
        await expect(bridge.getMaida2PlayDelaySeconds()).resolves.toBe(5);
    });
});

describe('bridge.setMaida2PlayDelaySeconds', () => {
    it('passes 3 through to invoke', async () => {
        invokeMock.mockResolvedValue({ success: true, seconds: 3 });
        const result = await bridge.setMaida2PlayDelaySeconds(3);
        expect(invokeMock).toHaveBeenCalledWith('set_maida2_play_delay_seconds', { seconds: 3 });
        expect(result).toEqual({ success: true, seconds: 3 });
    });

    it('passes 5 through to invoke', async () => {
        invokeMock.mockResolvedValue({ success: true, seconds: 5 });
        await bridge.setMaida2PlayDelaySeconds(5);
        expect(invokeMock).toHaveBeenCalledWith('set_maida2_play_delay_seconds', { seconds: 5 });
    });

    it('rejects any value outside {3, 5}', async () => {
        await expect(bridge.setMaida2PlayDelaySeconds(4)).rejects.toThrow(/expected 3 or 5/);
        await expect(bridge.setMaida2PlayDelaySeconds(0)).rejects.toThrow(/expected 3 or 5/);
        await expect(bridge.setMaida2PlayDelaySeconds('abc')).rejects.toThrow(/expected 3 or 5/);
        expect(invokeMock).not.toHaveBeenCalled();
    });
});

describe('bridge.getMaida2PreviewAudio', () => {
    it('returns true when Rust returns true', async () => {
        invokeMock.mockResolvedValue(true);
        await expect(bridge.getMaida2PreviewAudio()).resolves.toBe(true);
        expect(invokeMock).toHaveBeenCalledWith('get_maida2_preview_audio', {});
    });

    it('returns false when Rust returns false', async () => {
        invokeMock.mockResolvedValue(false);
        await expect(bridge.getMaida2PreviewAudio()).resolves.toBe(false);
    });

    it('falls back to true when the invoke result is not a boolean', async () => {
        invokeMock.mockResolvedValue(null);
        await expect(bridge.getMaida2PreviewAudio()).resolves.toBe(true);
    });

    it('falls back to true when invoke throws (graceful degrade)', async () => {
        invokeMock.mockRejectedValue(new Error('no tauri runtime'));
        await expect(bridge.getMaida2PreviewAudio()).resolves.toBe(true);
    });
});

describe('bridge.setMaida2PreviewAudio', () => {
    it('passes true through to invoke', async () => {
        invokeMock.mockResolvedValue({ success: true, enabled: true });
        const result = await bridge.setMaida2PreviewAudio(true);
        expect(invokeMock).toHaveBeenCalledWith('set_maida2_preview_audio', { enabled: true });
        expect(result).toEqual({ success: true, enabled: true });
    });

    it('passes false through to invoke', async () => {
        invokeMock.mockResolvedValue({ success: true, enabled: false });
        await bridge.setMaida2PreviewAudio(false);
        expect(invokeMock).toHaveBeenCalledWith('set_maida2_preview_audio', { enabled: false });
    });

    it('coerces a truthy/falsy non-boolean to a real boolean', async () => {
        invokeMock.mockResolvedValue({ success: true });
        await bridge.setMaida2PreviewAudio(1);
        expect(invokeMock).toHaveBeenCalledWith('set_maida2_preview_audio', { enabled: true });
    });
});

describe('bridge.getMaida2LargeMotion', () => {
    it('returns the boolean returned by Rust', async () => {
        invokeMock.mockResolvedValue(false);
        await expect(bridge.getMaida2LargeMotion()).resolves.toBe(false);
        expect(invokeMock).toHaveBeenCalledWith('get_maida2_large_motion', {});
    });

    it('falls back to true when the invoke result is not a boolean', async () => {
        invokeMock.mockResolvedValue(null);
        await expect(bridge.getMaida2LargeMotion()).resolves.toBe(true);
    });

    it('falls back to true when invoke throws (graceful degrade)', async () => {
        invokeMock.mockRejectedValue(new Error('no tauri runtime'));
        await expect(bridge.getMaida2LargeMotion()).resolves.toBe(true);
    });
});

describe('bridge.setMaida2LargeMotion', () => {
    it('passes false through to invoke', async () => {
        invokeMock.mockResolvedValue({ success: true, enabled: false });
        await bridge.setMaida2LargeMotion(false);
        expect(invokeMock).toHaveBeenCalledWith('set_maida2_large_motion', { enabled: false });
    });

    it('coerces a non-boolean to a real boolean', async () => {
        invokeMock.mockResolvedValue({ success: true });
        await bridge.setMaida2LargeMotion(0);
        expect(invokeMock).toHaveBeenCalledWith('set_maida2_large_motion', { enabled: false });
    });
});

describe('bridge.getMaida2CardOpacity', () => {
    it('returns the number returned by Rust', async () => {
        invokeMock.mockResolvedValue(85);
        await expect(bridge.getMaida2CardOpacity()).resolves.toBe(85);
        expect(invokeMock).toHaveBeenCalledWith('get_maida2_card_opacity', {});
    });

    it('falls back to 70 when the invoke result is not a number', async () => {
        invokeMock.mockResolvedValue(null);
        await expect(bridge.getMaida2CardOpacity()).resolves.toBe(70);
    });

    it('falls back to 70 when invoke throws (graceful degrade)', async () => {
        invokeMock.mockRejectedValue(new Error('no tauri runtime'));
        await expect(bridge.getMaida2CardOpacity()).resolves.toBe(70);
    });
});

describe('bridge.setMaida2CardOpacity', () => {
    it('passes a valid integer through to invoke', async () => {
        invokeMock.mockResolvedValue({ success: true, percent: 85 });
        const result = await bridge.setMaida2CardOpacity(85);
        expect(invokeMock).toHaveBeenCalledWith('set_maida2_card_opacity', { percent: 85 });
        expect(result).toEqual({ success: true, percent: 85 });
    });

    it('rounds fractional percent to the nearest integer', async () => {
        invokeMock.mockResolvedValue({ success: true });
        await bridge.setMaida2CardOpacity(70.6);
        expect(invokeMock).toHaveBeenCalledWith('set_maida2_card_opacity', { percent: 71 });
    });

    it('rejects values below the floor', async () => {
        await expect(bridge.setMaida2CardOpacity(39)).rejects.toThrow(/out of range/);
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('rejects values above the ceiling', async () => {
        await expect(bridge.setMaida2CardOpacity(101)).rejects.toThrow(/out of range/);
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('rejects non-numeric input', async () => {
        await expect(bridge.setMaida2CardOpacity('abc')).rejects.toThrow(/out of range/);
        expect(invokeMock).not.toHaveBeenCalled();
    });

    it('accepts boundary values 40 and 100', async () => {
        invokeMock.mockResolvedValue({ success: true });
        await bridge.setMaida2CardOpacity(40);
        await bridge.setMaida2CardOpacity(100);
        expect(invokeMock).toHaveBeenCalledTimes(2);
        expect(invokeMock).toHaveBeenNthCalledWith(1, 'set_maida2_card_opacity', { percent: 40 });
        expect(invokeMock).toHaveBeenNthCalledWith(2, 'set_maida2_card_opacity', { percent: 100 });
    });
});
