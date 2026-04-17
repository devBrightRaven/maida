import { describe, it, expect } from 'vitest';
import {
    applyDeadZone,
    computeScrollDelta,
    discretizeStick,
    shouldSuppressRStickScroll,
} from '../../hooks/gamepadLogic';

describe('applyDeadZone', () => {
    it('returns 0 within the dead zone', () => {
        expect(applyDeadZone(0, 0.15)).toBe(0);
        expect(applyDeadZone(0.14, 0.15)).toBe(0);
        expect(applyDeadZone(-0.14, 0.15)).toBe(0);
        expect(applyDeadZone(0.15, 0.15)).toBe(0);
    });

    it('normalizes past the dead zone so just-outside ≈ 0', () => {
        const v = applyDeadZone(0.16, 0.15);
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(0.02);
    });

    it('full deflection maps to ±1', () => {
        expect(applyDeadZone(1, 0.15)).toBe(1);
        expect(applyDeadZone(-1, 0.15)).toBe(-1);
    });

    it('preserves sign', () => {
        expect(applyDeadZone(-0.5, 0.15)).toBeLessThan(0);
        expect(applyDeadZone(0.5, 0.15)).toBeGreaterThan(0);
    });

    it('scales linearly between dead zone and 1', () => {
        // axis=0.575 with deadZone=0.15 → (0.575-0.15)/0.85 = 0.5
        expect(applyDeadZone(0.575, 0.15)).toBeCloseTo(0.5, 5);
    });

    it('clamps values above 1 to 1', () => {
        expect(applyDeadZone(1.2, 0.15)).toBe(1);
        expect(applyDeadZone(-1.5, 0.15)).toBe(-1);
    });
});

describe('computeScrollDelta', () => {
    it('returns 0 inside dead zone', () => {
        expect(computeScrollDelta(0.1, 1500, 0.016, 0.15)).toBe(0);
    });

    it('scales with dt and speed', () => {
        // Full deflection, 16ms frame, 1500 px/sec → 24 px
        expect(computeScrollDelta(1, 1500, 0.016, 0.15)).toBeCloseTo(24, 5);
    });

    it('negative axis produces negative delta', () => {
        expect(computeScrollDelta(-1, 1500, 0.016, 0.15)).toBeCloseTo(-24, 5);
    });

    it('doubles when dt doubles', () => {
        const a = computeScrollDelta(0.5, 1500, 0.016, 0.15);
        const b = computeScrollDelta(0.5, 1500, 0.032, 0.15);
        expect(b).toBeCloseTo(a * 2, 5);
    });
});

describe('discretizeStick', () => {
    it('returns null within threshold on both axes', () => {
        expect(discretizeStick(0, 0, 0.5)).toBeNull();
        expect(discretizeStick(0.4, 0.4, 0.5)).toBeNull();
        expect(discretizeStick(-0.49, 0.49, 0.5)).toBeNull();
    });

    it('returns left/right when horizontal axis dominates', () => {
        expect(discretizeStick(-1, 0, 0.5)).toBe('left');
        expect(discretizeStick(1, 0, 0.5)).toBe('right');
        expect(discretizeStick(-0.8, 0.3, 0.5)).toBe('left');
        expect(discretizeStick(0.9, -0.4, 0.5)).toBe('right');
    });

    it('returns up/down when vertical axis dominates', () => {
        expect(discretizeStick(0, -1, 0.5)).toBe('up');
        expect(discretizeStick(0, 1, 0.5)).toBe('down');
        expect(discretizeStick(0.3, -0.8, 0.5)).toBe('up');
        expect(discretizeStick(-0.4, 0.9, 0.5)).toBe('down');
    });

    it('ties resolve horizontally', () => {
        expect(discretizeStick(0.8, 0.8, 0.5)).toBe('right');
        expect(discretizeStick(-0.8, -0.8, 0.5)).toBe('left');
    });

    it('uses the supplied threshold', () => {
        expect(discretizeStick(0.3, 0, 0.2)).toBe('right');
        expect(discretizeStick(0.3, 0, 0.5)).toBeNull();
    });

    it('one axis above threshold, other below, picks the triggered one', () => {
        // X is below threshold, Y is above — vertical wins even if |X| > |Y|
        // is false. Matches "cardinal only when a stick is actually pushed".
        expect(discretizeStick(0.3, -0.6, 0.5)).toBe('up');
        expect(discretizeStick(-0.3, 0.7, 0.5)).toBe('down');
    });
});

describe('shouldSuppressRStickScroll', () => {
    it('returns false for no active element', () => {
        expect(shouldSuppressRStickScroll(null)).toBe(false);
        expect(shouldSuppressRStickScroll(undefined)).toBe(false);
    });

    it('suppresses inside a text input', () => {
        expect(shouldSuppressRStickScroll({ tagName: 'INPUT', type: 'text' })).toBe(true);
        expect(shouldSuppressRStickScroll({ tagName: 'INPUT', type: 'search' })).toBe(true);
        expect(shouldSuppressRStickScroll({ tagName: 'INPUT', type: '' })).toBe(true);
    });

    it('does not suppress for non-text input types', () => {
        expect(shouldSuppressRStickScroll({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
        expect(shouldSuppressRStickScroll({ tagName: 'INPUT', type: 'range' })).toBe(false);
        expect(shouldSuppressRStickScroll({ tagName: 'INPUT', type: 'radio' })).toBe(false);
    });

    it('suppresses inside textarea', () => {
        expect(shouldSuppressRStickScroll({ tagName: 'TEXTAREA' })).toBe(true);
    });

    it('suppresses inside role=combobox', () => {
        const el = {
            tagName: 'DIV',
            getAttribute: (k) => (k === 'role' ? 'combobox' : null),
        };
        expect(shouldSuppressRStickScroll(el)).toBe(true);
    });

    it('suppresses inside contenteditable', () => {
        expect(shouldSuppressRStickScroll({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    });

    it('does not suppress for a regular button', () => {
        expect(shouldSuppressRStickScroll({ tagName: 'BUTTON' })).toBe(false);
    });
});
