import { useEffect, useRef, useState } from 'react';
import { vibrate, vibrateProgress } from '../services/haptics';

/**
 * useGameInput
 * Unified input handler for Keyboard and Gamepad (D-pad only).
 * Supports "Long Press" detection for anchoring mechanics.
 *
 * Input sources:
 * - Keyboard: Arrow keys, Enter/Space, Escape
 * - Gamepad: D-pad (buttons 12-15), A (button 0), B (button 1)
 *
 * @param {Object} config
 * @param {Function} config.onMainAction - A / Enter (Short Press)
 * @param {Function} config.onAnchor - A / Enter (Long Press > 3s)
 * @param {Function} config.onBack - B / Esc
 * @param {Function} config.onNav - D-pad / Arrow Keys (up, down, left, right)
 * @param {Function} config.onL1 - L1/LB (button 4) — face switch
 * @param {Function} config.onR1 - R1/RB (button 5) — face switch
 * @param {Function} config.onMenu - Menu/Start (button 9) — open settings
 * @param {boolean} config.disabled - Disable input processing
 */
export function useGameInput({
    onMainAction,
    onAnchor,
    onBack,
    onNav,
    onL1,
    onR1,
    onYButton,
    onMenu,
    disabled = false,
    tapThreshold = 300,
    anchorThreshold = 3000
}) {
    const [longPressProgress, setLongPressProgress] = useState(0); // 0 to 1
    const pressStartTime = useRef(null);
    const progressFrame = useRef(null);
    const longPressTriggered = useRef(false); // Track if long press was triggered
    const lastHapticTime = useRef(0); // Throttle haptic feedback


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
    const callbacksRef = useRef({ onMainAction, onAnchor, onBack, onNav, onL1, onR1, onYButton, onMenu });
    useEffect(() => {
        callbacksRef.current = { onMainAction, onAnchor, onBack, onNav, onL1, onR1, onYButton, onMenu };
    }, [onMainAction, onAnchor, onBack, onNav, onL1, onR1, onYButton, onMenu]);

    // Animation Loop for smooth progress bar
    const updateProgress = () => {
        if (!pressStartTime.current) return;
        const elapsed = Date.now() - pressStartTime.current;
        const progress = Math.min(elapsed / anchorThreshold, 1);
        setLongPressProgress(progress);

        if (progress < 1) {
            // Haptic pulse every 400ms during hold
            const now = Date.now();
            if (now - lastHapticTime.current >= 400) {
                vibrateProgress(progress);
                lastHapticTime.current = now;
            }
            progressFrame.current = requestAnimationFrame(updateProgress);
        } else {
            if (import.meta.env.DEV) console.log('[Input] Long Press Complete! Triggering Anchor.');
            longPressTriggered.current = true;
            vibrate('strong');
            resetPress();
            if (!disabled && callbacksRef.current.onAnchor) callbacksRef.current.onAnchor();
        }
    };

    // Exposed handlers for UI elements (e.g. Mouse/Touch)
    const handleStartPress = () => {
        if (import.meta.env.DEV) console.log('[Input] Start Press Called', { disabled, currentRef: pressStartTime.current });
        if (!disabled && !pressStartTime.current) {
            pressStartTime.current = Date.now();
            lastHapticTime.current = Date.now();
            vibrate('confirm');
            if (import.meta.env.DEV) console.log('[Input] SET pressStartTime:', pressStartTime.current);
            progressFrame.current = requestAnimationFrame(updateProgress);
        } else {
            if (import.meta.env.DEV) console.log('[Input] Start Press Ignored (disabled or already pressed)');
        }
    };

    const handleEndPress = () => {
        // console.log('[Input] End Press', { disabled, pressStartTime: pressStartTime.current, longPressTriggered: longPressTriggered.current });
        if (pressStartTime.current) {
            const elapsed = Date.now() - pressStartTime.current;
            if (import.meta.env.DEV) console.log('[Input] Elapsed:', elapsed, 'TapThreshold:', tapThreshold);

            // Only check if long press didn't already fire
            if (!longPressTriggered.current && !disabled) {
                if (elapsed <= tapThreshold) {
                    if (import.meta.env.DEV) console.log('[Input] Valid Tap (< ' + tapThreshold + 'ms). Triggering Action.');
                    if (callbacksRef.current.onMainAction) callbacksRef.current.onMainAction();
                } else {
                    if (import.meta.env.DEV) console.log('[Input] Dead Zone (' + elapsed + 'ms). Action Cancelled.');
                }
            }
            resetPress();
        }
    };

    // Cancel handler for pointerleave/blur - does NOT trigger action
    const handleCancelPress = () => {
        // Only cancel if a press is actually in progress
        if (pressStartTime.current || progressFrame.current) {
            if (import.meta.env.DEV) console.log('[Input] Cancel Press');
            resetPress();
        }
        // If no press, do nothing (not even log)
    };

    // ========== KEYBOARD INPUT ==========
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (disabled || !document.hasFocus()) return;
            const key = e.key;

            // Skip when the event originated inside a widget that owns
            // its own keys (ARIA search landmark, listbox, menu). Use
            // e.target (dispatch origin) rather than document.activeElement
            // so a handler that shifts focus (e.g. KamaeSearch layered
            // Escape's 3rd tier focusing the active kata) is not then
            // double-handled by this global nav as if focus had always
            // been on the destination.
            if (e.target?.closest?.('[role="search"], [role="listbox"], [role="menu"]')) return;

            // Block Space on buttons — intentional defense against NVDA browse-mode
            // synthetic clicks. NVDA in browse mode translates Space into a synthetic
            // click (detail=1, identical to mouse click); with focus on TRY this would
            // bypass the long-press friction and launch a game unintentionally. Enter
            // still provides full keyboard access (short press = visit, hold 3s = anchor).
            // Combined with default-focus-on-NOT-NOW, this makes accidental activation
            // safe (skip instead of launch). See journal 2026-03-24, commit 5c4f9152.
            // Documented in AccessibilityPage as a known limitation.
            if (key === ' ') {
                const active = document.activeElement;
                if (active && active.tagName === 'BUTTON') {
                    e.preventDefault();
                }
                return;
            }

            // Navigation — skip if a text input/combobox is focused (let it handle arrows)
            // Checkboxes don't use arrow keys, so let them through for navigation
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
                const active = document.activeElement;
                const isTextInput = active && (
                    (active.tagName === 'INPUT' && active.type !== 'checkbox') ||
                    active.tagName === 'TEXTAREA' ||
                    active.tagName === 'SELECT' ||
                    active.getAttribute('role') === 'combobox'
                );
                if (isTextInput) return;
                e.preventDefault();
                if (callbacksRef.current.onNav) callbacksRef.current.onNav(key.replace('Arrow', '').toLowerCase());
                return;
            }

            // Back / Cancel — skip if text input/combobox is focused (let it handle Escape)
            // Checkboxes don't use Escape, so let them through
            if (key === 'Escape') {
                const active = document.activeElement;
                const isTextInput = active && (
                    (active.tagName === 'INPUT' && active.type !== 'checkbox') ||
                    active.tagName === 'TEXTAREA' ||
                    active.getAttribute('role') === 'combobox'
                );
                if (isTextInput) {
                    active.blur();
                    return;
                }
                if (callbacksRef.current.onBack) callbacksRef.current.onBack();
                return;
            }

            // Main Action (Start Press)
            // If a button or input is focused, let browser handle it natively
            // Only intercept when no interactive element has focus
            if (key === 'Enter') {
                const active = document.activeElement;
                const isInteractive = active && (
                    active.tagName === 'BUTTON' ||
                    active.tagName === 'INPUT' ||
                    active.tagName === 'TEXTAREA' ||
                    active.tagName === 'SELECT' ||
                    active.tagName === 'A'
                );
                if (isInteractive) return; // Let browser native click/submit handle it
                if (!e.repeat) handleStartPress();
            }
        };

        const handleKeyUp = (e) => {
            const key = e.key;
            // Block Space on buttons on keyup too — browser natively fires click on
            // keyup, so intercepting only keydown is insufficient. See comment on
            // handleKeyDown above for full rationale.
            if (key === ' ') {
                const active = document.activeElement;
                if (active && active.tagName === 'BUTTON') {
                    e.preventDefault();
                }
                return;
            }
            // Main Action (Release) — only if we started the press
            if (key === 'Enter') {
                if (pressStartTime.current) handleEndPress();
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
        const BTN_A = 0, BTN_B = 1, BTN_Y = 3, BTN_L1 = 4, BTN_R1 = 5, BTN_MENU = 9;
        const DPAD_UP = 12, DPAD_DOWN = 13, DPAD_LEFT = 14, DPAD_RIGHT = 15;

        // D-pad state + repeat timing
        const lastDpad = { up: false, down: false, left: false, right: false };
        const dpadHeldSince = { up: 0, down: 0, left: 0, right: 0 };
        const dpadLastRepeat = { up: 0, down: 0, left: 0, right: 0 };
        const DPAD_INITIAL_DELAY = 400; // ms before repeat starts
        const DPAD_REPEAT_INTERVAL = 100; // ms between repeats
        let aButtonDown = false;
        let aButtonTarget = null;
        let lastB = false;
        let lastY = false;
        let lastL1 = false;
        let lastR1 = false;
        let lastMenu = false;

        // Helper: get focused interactive element
        const getFocusedInteractive = () => {
            const el = document.activeElement;
            if (!el) return null;
            if (el.tagName === 'BUTTON') return el;
            if (el.getAttribute('role') === 'button') return el;
            if (el.tagName === 'INPUT') return el;
            if (el.tagName === 'LABEL') return el;
            // Keyboard-focusable custom elements (tabindex=0) that own an
            // onClick / onKeyDown(Enter) handler — e.g. the kata-group div
            // in KataPanel which uses role="group" but activates via click.
            // Keyboard Enter already fires the element's own handlers via
            // native focus; gamepad A should match by dispatching a click
            // rather than falling through to the long-press tracker.
            // tabindex=-1 is excluded because that's programmatic-only
            // focus (e.g. showcase-item) with no user activation intent.
            const tabIndex = el.getAttribute('tabindex');
            if (tabIndex !== null && Number(tabIndex) >= 0) return el;
            return null;
        };

        let animFrame = null;
        let isPolling = false;

        const pollGamepad = () => {
            if (!isPolling || !document.hasFocus()) return; // Stop if window lost focus

            const gamepads = navigator.getGamepads?.() || [];
            const gp = gamepads[0];

            if (gp) {
                const btn = (i) => gp.buttons[i]?.pressed;

                // D-pad, A, B — only process if this instance handles them
                const hasNavHandlers = callbacksRef.current.onNav || callbacksRef.current.onMainAction || callbacksRef.current.onBack;

                if (hasNavHandlers) {
                    // D-pad navigation (with edge detection)
                    const dpadState = {
                        up: btn(DPAD_UP),
                        down: btn(DPAD_DOWN),
                        left: btn(DPAD_LEFT),
                        right: btn(DPAD_RIGHT)
                    };

                    const now = Date.now();
                    for (const dir of ['up', 'down', 'left', 'right']) {
                        if (dpadState[dir]) {
                            if (!lastDpad[dir]) {
                                // Initial press
                                callbacksRef.current.onNav?.(dir);
                                dpadHeldSince[dir] = now;
                                dpadLastRepeat[dir] = now;
                            } else if (now - dpadHeldSince[dir] >= DPAD_INITIAL_DELAY
                                && now - dpadLastRepeat[dir] >= DPAD_REPEAT_INTERVAL) {
                                // Repeat while held
                                callbacksRef.current.onNav?.(dir);
                                dpadLastRepeat[dir] = now;
                            }
                        } else {
                            dpadHeldSince[dir] = 0;
                        }
                    }

                    Object.assign(lastDpad, dpadState);

                    // A button - activates the FOCUSED element
                    const aPressed = btn(BTN_A);
                    if (aPressed && !aButtonDown) {
                        aButtonDown = true;
                        aButtonTarget = getFocusedInteractive();
                        if (aButtonTarget) {
                            const needsPointer = aButtonTarget.classList.contains('visit') || aButtonTarget.classList.contains('showcase-hold-btn');
                            if (needsPointer) {
                                aButtonTarget.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                            }
                        } else if (callbacksRef.current.onAnchor) {
                            handleStartPress();
                        }
                    } else if (!aPressed && aButtonDown) {
                        aButtonDown = false;
                        if (aButtonTarget) {
                            const needsPointer = aButtonTarget.classList.contains('visit') || aButtonTarget.classList.contains('showcase-hold-btn');
                            if (needsPointer) {
                                aButtonTarget.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                            } else if (aButtonTarget.tagName === 'INPUT') {
                                aButtonTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                            } else {
                                aButtonTarget.click();
                            }
                            aButtonTarget = null;
                        } else {
                            handleEndPress();
                        }
                    }

                    // B button - contextual back/cancel
                    const bPressed = btn(BTN_B);
                    if (bPressed && !lastB) callbacksRef.current.onBack?.();
                    lastB = bPressed;

                    // Y button - secondary action (e.g. rename)
                    const yPressed = btn(BTN_Y);
                    if (yPressed && !lastY) callbacksRef.current.onYButton?.();
                    lastY = yPressed;
                }

                // L1/R1 - face switching (only when configured)
                const l1Pressed = btn(BTN_L1);
                if (l1Pressed && !lastL1) callbacksRef.current.onL1?.();
                lastL1 = l1Pressed;

                const r1Pressed = btn(BTN_R1);
                if (r1Pressed && !lastR1) callbacksRef.current.onR1?.();
                lastR1 = r1Pressed;

                // Menu/Start button — settings
                const menuPressed = btn(BTN_MENU);
                if (menuPressed && !lastMenu) callbacksRef.current.onMenu?.();
                lastMenu = menuPressed;
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
            lastY = false;
            lastL1 = false;
            lastR1 = false;
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
