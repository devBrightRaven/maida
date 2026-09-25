/**
 * Settings-close return-face logic — pure function extracted from App.jsx.
 * No React, no side effects. Fully testable.
 *
 * F10/Menu opens Settings from whichever face the user was on. The
 * settings panel only renders inside KamaeView, so opening it from
 * Maida2 or Rin first borrows Kamae (see App.jsx openSettings, which
 * records the origin face in settingsReturnFaceRef before switching).
 * Closing settings (Esc, B, or the panel's own close button) must send
 * the user back to that origin face instead of stranding them on Kamae.
 */

// Faces settings can legitimately return the user to after borrowing
// Kamae. Opening directly from Kamae leaves the ref at null (see
// App.jsx), so 'kamae' itself is never a stored return face.
const RETURNABLE_FACES = new Set(['maida2', 'rin']);

/**
 * Given settingsReturnFaceRef.current at close time, return the face to
 * switch back to, or null when no switch is needed (opened directly from
 * Kamae, or the ref was already consumed).
 */
export function resolveSettingsReturnFace(returnFace) {
    return RETURNABLE_FACES.has(returnFace) ? returnFace : null;
}
