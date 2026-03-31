/**
 * Gamepad haptic feedback via Vibration Actuator API.
 * Silent no-op if gamepad not connected or API not supported.
 * Intensity configurable via localStorage (0-100, default 100).
 */

const STORAGE_KEY = 'maida_haptic_intensity';
const DEFAULT_INTENSITY = 100;

// Presets at full intensity (100%). Duration unified at 500ms.
const PRESETS = {
    light:    { duration: 500, weakMagnitude: 0.6, strongMagnitude: 0.0 },
    medium:   { duration: 500, weakMagnitude: 1.0, strongMagnitude: 0.4 },
    strong:   { duration: 500, weakMagnitude: 1.0, strongMagnitude: 1.0 },
    confirm:  { duration: 500, weakMagnitude: 0.8, strongMagnitude: 0.2 },
};

export function getIntensity() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
            const val = Number(stored);
            if (!isNaN(val) && val >= 0 && val <= 100) return val;
        }
    } catch {}
    return DEFAULT_INTENSITY;
}

export function setIntensity(value) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    try { localStorage.setItem(STORAGE_KEY, String(clamped)); } catch {}
}

function scale(magnitude) {
    const factor = getIntensity() / 100;
    return Math.min(magnitude * factor, 1.0);
}

export function vibrate(type = 'light') {
    const intensity = getIntensity();
    if (intensity === 0) return;

    const gp = navigator.getGamepads?.()?.[0];
    if (!gp?.vibrationActuator) return;

    const preset = PRESETS[type] || PRESETS.light;
    gp.vibrationActuator.playEffect('dual-rumble', {
        duration: preset.duration,
        weakMagnitude: scale(preset.weakMagnitude),
        strongMagnitude: scale(preset.strongMagnitude),
    }).catch(() => {});
}

/**
 * Progressive vibration for hold actions.
 * Intensity scales with both progress (0-1) and user setting.
 */
export function vibrateProgress(progress) {
    const intensity = getIntensity();
    if (intensity === 0) return;

    const gp = navigator.getGamepads?.()?.[0];
    if (!gp?.vibrationActuator) return;

    const weak = Math.min(0.4 + progress * 1.0, 1.0);
    const strong = Math.min(progress * 0.8, 0.8);

    gp.vibrationActuator.playEffect('dual-rumble', {
        duration: 60,
        weakMagnitude: scale(weak),
        strongMagnitude: scale(strong),
    }).catch(() => {});
}
