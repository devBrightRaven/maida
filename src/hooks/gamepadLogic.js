/**
 * Pure logic helpers for gamepad input processing.
 * Extracted for isolated unit testing without DOM / rAF setup.
 */

/**
 * Normalize an analog stick axis value against a dead zone.
 * Returns 0 if within the dead zone; otherwise returns a value in
 * (-1, -0] ∪ [0, 1) rescaled so that just-outside-dead-zone ≈ 0
 * and full deflection = ±1. Preserves sign.
 *
 * @param {number} axis - raw axis value in [-1, 1]
 * @param {number} deadZone - magnitude below which the stick is treated as neutral
 * @returns {number} normalized magnitude with sign, or 0
 */
export function applyDeadZone(axis, deadZone) {
    const mag = Math.abs(axis);
    if (mag <= deadZone) return 0;
    const normalized = (mag - deadZone) / (1 - deadZone);
    return Math.sign(axis) * Math.min(normalized, 1);
}

/**
 * Compute pixel delta for an analog-stick scroll frame.
 *
 * @param {number} axis - raw axis value
 * @param {number} speedPxPerSec - scroll speed at full deflection (px/sec)
 * @param {number} dtSec - time delta since last frame (seconds)
 * @param {number} deadZone
 * @returns {number} pixel delta (sign matches axis direction)
 */
export function computeScrollDelta(axis, speedPxPerSec, dtSec, deadZone) {
    const normalized = applyDeadZone(axis, deadZone);
    if (normalized === 0) return 0;
    return normalized * speedPxPerSec * dtSec;
}

/**
 * Decide whether R-stick scroll should be suppressed based on the
 * currently focused element. We skip scroll when the user is typing
 * in a text-like input so arrow/wheel-like focus behavior isn't hijacked.
 */
export function shouldSuppressRStickScroll(activeElement) {
    if (!activeElement) return false;
    const tag = activeElement.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
        const type = (activeElement.type || '').toLowerCase();
        // Text-like input types where scroll would fight the caret/UI
        const textLike = ['text', 'search', 'email', 'url', 'password', 'tel', 'number', ''];
        return textLike.includes(type);
    }
    if (activeElement.getAttribute?.('role') === 'combobox') return true;
    if (activeElement.isContentEditable) return true;
    return false;
}
