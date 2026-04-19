/**
 * Gamepad connection tracker.
 *
 * Centralizes "which gamepad index is currently active" so input polling
 * (useGameInput), analog scroll (useGamepadScroll) and haptics all read
 * the same pad. On Windows HID a disconnect does not always fire a clean
 * `gamepaddisconnected` event, so the browser can reassign a reconnected
 * pad to index 1 while a ghost stays at index 0; hardcoding `[0]` then
 * stops detecting input until the page reloads.
 *
 * This module:
 *  - Listens for `gamepadconnected` / `gamepaddisconnected` on window
 *  - Tracks the first non-null pad's index
 *  - Re-scans on disconnect so we fall back to any remaining pad
 *  - Exposes `getActiveGamepad()` which returns the live Gamepad object
 *    (or null). Callers pass no index, which keeps them in sync.
 *
 * Initialization is idempotent and lazy: the first call to
 * `getActiveGamepad()` installs listeners and runs an initial scan.
 * This handles the "app launched with gamepad already connected"
 * case where the `gamepadconnected` event fired before we mounted.
 */

let activeIndex = null;
let initialized = false;

function rescan() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
        activeIndex = null;
        return;
    }
    const pads = navigator.getGamepads() || [];
    for (let i = 0; i < pads.length; i++) {
        if (pads[i]) {
            activeIndex = i;
            return;
        }
    }
    activeIndex = null;
}

function handleConnected(event) {
    // Prefer the freshly-connected pad; this matches user intent when a
    // second controller is plugged in mid-session.
    if (event?.gamepad && typeof event.gamepad.index === 'number') {
        activeIndex = event.gamepad.index;
    } else {
        rescan();
    }
}

function handleDisconnected(event) {
    const idx = event?.gamepad?.index;
    if (idx !== undefined && idx === activeIndex) {
        activeIndex = null;
    }
    // Always rescan — if another pad is still present, fall back to it.
    rescan();
}

function ensureInitialized() {
    if (initialized) return;
    initialized = true;
    if (typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected', handleConnected);
    window.addEventListener('gamepaddisconnected', handleDisconnected);
    // Initial scan for pads already connected before listeners installed.
    rescan();
}

/**
 * Returns the currently active Gamepad object or null.
 *
 * IMPORTANT: Gamepad objects from `navigator.getGamepads()` are snapshots
 * in Chromium — you must call this every frame to see updated button /
 * axis state. Do not cache the returned object across frames.
 */
export function getActiveGamepad() {
    ensureInitialized();
    if (activeIndex === null) return null;
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
        return null;
    }
    const pads = navigator.getGamepads() || [];
    const gp = pads[activeIndex];
    if (!gp) {
        // Ghost entry: the browser kept the slot but the pad is gone.
        // Rescan for another live pad, then return whatever is active.
        rescan();
        if (activeIndex === null) return null;
        return navigator.getGamepads()?.[activeIndex] ?? null;
    }
    return gp;
}

/**
 * Returns the currently active gamepad index or null. Exposed mainly
 * for tests and diagnostics; most callers should use `getActiveGamepad()`.
 */
export function getActiveGamepadIndex() {
    ensureInitialized();
    return activeIndex;
}

/**
 * Test-only: reset module state. Production code must not call this.
 */
export function __resetForTests() {
    if (typeof window !== 'undefined' && initialized) {
        window.removeEventListener('gamepadconnected', handleConnected);
        window.removeEventListener('gamepaddisconnected', handleDisconnected);
    }
    activeIndex = null;
    initialized = false;
}
