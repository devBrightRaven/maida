import { useEffect, useRef, useState } from 'react';

/**
 * useGameInput
 * Unified input handler for Keyboard and Gamepad (D-pad only).
 * Supports "Long Press" detection for anchoring mechanics.
 *
 * Input sources:
 * - Keyboard: Arrow keys, Enter/Space, Escape/Backspace
 * - Gamepad: D-pad (buttons 12-15), A (button 0), B (button 1)
 *
 * @param {Object} config
 * @param {Function} config.onMainAction - A / Enter (Short Press)
 * @param {Function} config.onAnchor - A / Enter (Long Press > 3s)
 * @param {Function} config.onBack - B / Esc / Backspace
 * @param {Function} config.onNav - D-pad / Arrow Keys (up, down, left, right)
 * @param {boolean} config.disabled - Disable input processing
 */
export function useGameInput({
    onMainAction,
    onAnchor,
    onBack,
    onNav,
    disabled = false,
    tapThreshold = 300,
    anchorThreshold = 3000
}) {
    const [longPressProgress, setLongPressProgress] = useState(0); // 0 to 1
    const pressStartTime = useRef(null);
    const progressFrame = useRef(null);
    const longPressTriggered = useRef(false); // Track if long press was triggered


    // Clear progress/timers helper
    const resetPress = () => {
        pressStartTime.current = null;
        longPressTriggered.current = false;
        setLongPressProgress(0);
        if (progressFrame.current) {
            cancelAnimationFrame(progressFrame.current);
            progressFrame.current = null;
        }
    };

    // Use refs for callbacks to avoid re-running effect on every render
    const callbacksRef = useRef({ onMainAction, onAnchor, onBack, onNav });
    useEffect(() => {
        callbacksRef.current = { onMainAction, onAnchor, onBack, onNav };
    }, [onMainAction, onAnchor, onBack, onNav]);

    // Animation Loop for smooth progress bar
    const updateProgress = () => {
        if (!pressStartTime.current) return;
        const elapsed = Date.now() - pressStartTime.current;
        const progress = Math.min(elapsed / anchorThreshold, 1);
        // console.log('[Input] Progress:', progress.toFixed(2));
        setLongPressProgress(progress);

        if (progress < 1) {
            progressFrame.current = requestAnimationFrame(updateProgress);
        } else {
            console.log('[Input] Long Press Complete! Triggering Anchor.');
            longPressTriggered.current = true; // Lock out short press
            resetPress();
            if (!disabled && callbacksRef.current.onAnchor) callbacksRef.current.onAnchor();
        }
    };

    // Exposed handlers for UI elements (e.g. Mouse/Touch)
    const handleStartPress = () => {
        console.log('[Input] Start Press Called', { disabled, currentRef: pressStartTime.current });
        if (!disabled && !pressStartTime.current) {
            pressStartTime.current = Date.now();
            console.log('[Input] SET pressStartTime:', pressStartTime.current);
            progressFrame.current = requestAnimationFrame(updateProgress);
        } else {
            console.log('[Input] Start Press Ignored (disabled or already pressed)');
        }
    };

    const handleEndPress = () => {
        // console.log('[Input] End Press', { disabled, pressStartTime: pressStartTime.current, longPressTriggered: longPressTriggered.current });
        if (pressStartTime.current) {
            const elapsed = Date.now() - pressStartTime.current;
            console.log('[Input] Elapsed:', elapsed, 'TapThreshold:', tapThreshold);

            // Only check if long press didn't already fire
            if (!longPressTriggered.current && !disabled) {
                if (elapsed <= tapThreshold) {
                    console.log('[Input] Valid Tap (< ' + tapThreshold + 'ms). Triggering Action.');
                    if (callbacksRef.current.onMainAction) callbacksRef.current.onMainAction();
                } else {
                    console.log('[Input] Dead Zone (' + elapsed + 'ms). Action Cancelled.');
                }
            }
            resetPress();
        }
    };

    // Cancel handler for pointerleave/blur - does NOT trigger action
    const handleCancelPress = () => {
        // Only cancel if a press is actually in progress
        if (pressStartTime.current || progressFrame.current) {
            console.log('[Input] Cancel Press');
            resetPress();
        }
        // If no press, do nothing (not even log)
    };

    // ========== KEYBOARD INPUT ==========
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (disabled) return;
            const key = e.key;

            // Navigation
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
                if (callbacksRef.current.onNav) callbacksRef.current.onNav(key.replace('Arrow', '').toLowerCase());
                return;
            }

            // Back / Cancel / Not Today
            if (key === 'Escape' || key === 'Backspace') {
                if (callbacksRef.current.onBack) callbacksRef.current.onBack();
                return;
            }

            // Main Action (Start Press)
            if (key === 'Enter' || key === ' ') {
                if (!e.repeat) handleStartPress();
            }
        };

        const handleKeyUp = (e) => {
            const key = e.key;
            // Main Action (Release)
            if (key === 'Enter' || key === ' ') {
                handleEndPress();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            resetPress();
        };
    }, [disabled]);

    // ========== GAMEPAD D-PAD INPUT ==========
    // Only poll when window is focused to avoid interfering with games
    useEffect(() => {
        if (disabled) return;

        // Button indices (standard gamepad mapping)
        const BTN_A = 0, BTN_B = 1;
        const DPAD_UP = 12, DPAD_DOWN = 13, DPAD_LEFT = 14, DPAD_RIGHT = 15;

        // Debounce state for D-pad (prevent rapid fire)
        const lastDpad = { up: false, down: false, left: false, right: false };
        let aButtonDown = false;
        let aButtonTarget = null;
        let lastB = false;

        // Helper: get focused button element
        const getFocusedButton = () => {
            const el = document.activeElement;
            return (el && el.tagName === 'BUTTON') ? el : null;
        };

        let animFrame = null;
        let isPolling = false;

        const pollGamepad = () => {
            if (!isPolling) return; // Stop if window lost focus

            const gamepads = navigator.getGamepads?.() || [];
            const gp = gamepads[0];

            if (gp) {
                const btn = (i) => gp.buttons[i]?.pressed;

                // D-pad navigation (with edge detection)
                const dpadState = {
                    up: btn(DPAD_UP),
                    down: btn(DPAD_DOWN),
                    left: btn(DPAD_LEFT),
                    right: btn(DPAD_RIGHT)
                };

                if (dpadState.up && !lastDpad.up) callbacksRef.current.onNav?.('up');
                if (dpadState.down && !lastDpad.down) callbacksRef.current.onNav?.('down');
                if (dpadState.left && !lastDpad.left) callbacksRef.current.onNav?.('left');
                if (dpadState.right && !lastDpad.right) callbacksRef.current.onNav?.('right');

                Object.assign(lastDpad, dpadState);

                // A button - activates the FOCUSED element
                const aPressed = btn(BTN_A);
                if (aPressed && !aButtonDown) {
                    aButtonDown = true;
                    aButtonTarget = getFocusedButton();
                    if (aButtonTarget) {
                        aButtonTarget.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                    } else {
                        handleStartPress();
                    }
                } else if (!aPressed && aButtonDown) {
                    aButtonDown = false;
                    if (aButtonTarget) {
                        aButtonTarget.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                        aButtonTarget.click();
                        aButtonTarget = null;
                    } else {
                        handleEndPress();
                    }
                }

                // B button - contextual back/cancel
                const bPressed = btn(BTN_B);
                if (bPressed && !lastB) callbacksRef.current.onBack?.();
                lastB = bPressed;
            }

            animFrame = requestAnimationFrame(pollGamepad);
        };

        const startPolling = () => {
            if (!isPolling) {
                isPolling = true;
                animFrame = requestAnimationFrame(pollGamepad);
            }
        };

        const stopPolling = () => {
            isPolling = false;
            if (animFrame) {
                cancelAnimationFrame(animFrame);
                animFrame = null;
            }
            // Reset button states to avoid stuck buttons
            aButtonDown = false;
            aButtonTarget = null;
            lastB = false;
            Object.assign(lastDpad, { up: false, down: false, left: false, right: false });
        };

        // Always start polling - blur event will stop it if window loses focus
        startPolling();

        window.addEventListener('focus', startPolling);
        window.addEventListener('blur', stopPolling);

        return () => {
            stopPolling();
            window.removeEventListener('focus', startPolling);
            window.removeEventListener('blur', stopPolling);
        };
    }, [disabled]);

    return {
        longPressProgress,
        handlers: {
            onPressStart: handleStartPress,
            onPressEnd: handleEndPress,
            onPressCancel: handleCancelPress // NEW: for leave/blur
        }
    };
}
