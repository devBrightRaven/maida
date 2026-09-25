import { describe, it, expect } from 'vitest';
import { shouldPlayBloom, bloomEndScale, bloomKeyframes, BLOOM_START_OPACITY, BLOOM_END_BLUR_PX, BLOOM_MAX_RADIUS_PX } from '../../ui/modeBloom';

describe('shouldPlayBloom (one-way opt-out)', () => {
    it('plays only when the OS allows motion and the setting is on', () => {
        expect(shouldPlayBloom({ osReducedMotion: false, largeMotion: true })).toBe(true);
    });

    it('never plays when the OS asks to reduce motion, even with the setting on', () => {
        expect(shouldPlayBloom({ osReducedMotion: true, largeMotion: true })).toBe(false);
    });

    it('does not play when the setting is off', () => {
        expect(shouldPlayBloom({ osReducedMotion: false, largeMotion: false })).toBe(false);
        expect(shouldPlayBloom({ osReducedMotion: true, largeMotion: false })).toBe(false);
    });

    it('treats a non-boolean setting as off', () => {
        expect(shouldPlayBloom({ osReducedMotion: false, largeMotion: undefined })).toBe(false);
    });

    it('never plays while the preference is still unresolved (null sentinel)', () => {
        // App.jsx seeds state with null until bridge.getMaida2LargeMotion()
        // resolves (review 2026-09-25 R1) — "not yet read" must gate the
        // same as "off", not fall through to the legacy default-on behavior.
        expect(shouldPlayBloom({ osReducedMotion: false, largeMotion: null })).toBe(false);
        expect(shouldPlayBloom({ osReducedMotion: true, largeMotion: null })).toBe(false);
    });
});

describe('bloomEndScale', () => {
    it('caps the ring radius at BLOOM_MAX_RADIUS_PX on a large viewport', () => {
        const size = 22;
        const scale = bloomEndScale({ cx: 100, cy: 150, size, vw: 1280, vh: 800 });
        expect(scale * size * 0.7).toBeCloseTo(2 * BLOOM_MAX_RADIUS_PX, 5);
    });

    it('stops at the farthest corner when the viewport is smaller than the cap', () => {
        const size = 22;
        const scale = bloomEndScale({ cx: 50, cy: 50, size, vw: 150, vh: 120 });
        const far = Math.hypot(150 - 50, 120 - 50);
        expect(scale * size * 0.7).toBeCloseTo(2 * far * 1.1, 5);
        expect(scale * size * 0.7).toBeLessThan(2 * BLOOM_MAX_RADIUS_PX);
    });

    it('returns 1 for a zero-size symbol', () => {
        expect(bloomEndScale({ cx: 0, cy: 0, size: 0, vw: 100, vh: 100 })).toBe(1);
    });
});

describe('bloomKeyframes', () => {
    const frames = bloomKeyframes(100, 8);
    const scaleOf = f => Number(f.transform.match(/scale\((.+)\)/)[1]);
    const blurOf = f => Number(f.filter.match(/blur\((.+)px\)/)[1]);

    it('starts at the symbol: scale 1, start opacity, no blur', () => {
        expect(frames[0]).toMatchObject({ offset: 0, transform: 'scale(1)', opacity: BLOOM_START_OPACITY });
        expect(blurOf(frames[0])).toBe(0);
    });

    it('ends at the end scale, fully transparent, at the screen-space end blur', () => {
        const last = frames.at(-1);
        expect(last.offset).toBe(1);
        expect(scaleOf(last)).toBeCloseTo(100);
        expect(last.opacity).toBeCloseTo(0);
        expect(blurOf(last) * scaleOf(last)).toBeCloseTo(BLOOM_END_BLUR_PX);
    });

    it('only animates transform, opacity and filter', () => {
        for (const f of frames) expect(Object.keys(f).sort()).toEqual(['filter', 'offset', 'opacity', 'transform']);
    });
});
