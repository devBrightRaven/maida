import { describe, it, expect } from 'vitest';
import { resolveSettingsReturnFace } from '../../core/settingsReturn';

// P0-2: closing Settings (Esc, B, or the panel's close button) must return
// the user to whichever face F10/Menu was opened from, not strand them on
// Kamae. settingsReturnFaceRef.current holds that origin face at close time:
// 'maida2', 'rin', or null (opened directly from Kamae — no borrow happened).
describe('resolveSettingsReturnFace', () => {
    it('opened from Maida2 (Maai): returns to maida2', () => {
        expect(resolveSettingsReturnFace('maida2')).toBe('maida2');
    });

    it('opened from Rin: returns to rin', () => {
        expect(resolveSettingsReturnFace('rin')).toBe('rin');
    });

    it('opened directly from Kamae (ref never set, stays null): no switch', () => {
        expect(resolveSettingsReturnFace(null)).toBeNull();
    });
});
