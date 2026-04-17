import { useEffect } from 'react';
import { resolveScrollTarget } from '../utils/scroll';
import {
    computeScrollDelta,
    shouldSuppressRStickScroll
} from './gamepadLogic';

// Standard mapping: axes[2] = right-stick X, axes[3] = right-stick Y.
const R_STICK_X = 2;
const R_STICK_Y = 3;
const DEAD_ZONE = 0.15;
const SCROLL_SPEED_PX_PER_SEC = 1500;

// Module-level singleton guard. Multiple hook instances would multiply
// scroll speed; we only let the first mounted instance drive the loop.
let activeInstance = 0;

/**
 * useGamepadScroll — app-wide right-stick analog scroll.
 *
 * Mount this hook EXACTLY ONCE at the application root. It polls the
 * right analog stick and scrolls the nearest scrollable ancestor of
 * the currently focused element (or document.scrollingElement as a
 * fallback). It does not go through React state because analog input
 * is continuous (60Hz) and scrollTop changes do not require re-render.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.disabled] - pause polling
 */
export function useGamepadScroll({ disabled = false } = {}) {
    useEffect(() => {
        if (disabled) return;

        const instanceId = ++activeInstance;
        let animFrame = null;
        let isPolling = false;
        let lastFrameTs = 0;

        const poll = () => {
            if (!isPolling) return;
            // Only the most-recently-mounted instance drives scroll; others
            // idle so duplicate mounts (e.g. StrictMode double-invoke) don't
            // compound the speed.
            if (instanceId !== activeInstance) {
                animFrame = requestAnimationFrame(poll);
                return;
            }
            if (typeof document !== 'undefined' && !document.hasFocus()) {
                animFrame = requestAnimationFrame(poll);
                return;
            }

            const now = performance.now();
            const dtSec = lastFrameTs === 0 ? 0 : (now - lastFrameTs) / 1000;
            lastFrameTs = now;

            const pads = navigator.getGamepads?.() || [];
            const gp = pads[0];
            if (gp && gp.axes && gp.axes.length > R_STICK_Y && dtSec > 0) {
                const axisX = gp.axes[R_STICK_X] ?? 0;
                const axisY = gp.axes[R_STICK_Y] ?? 0;

                if (!shouldSuppressRStickScroll(document.activeElement)) {
                    const dx = computeScrollDelta(axisX, SCROLL_SPEED_PX_PER_SEC, dtSec, DEAD_ZONE);
                    const dy = computeScrollDelta(axisY, SCROLL_SPEED_PX_PER_SEC, dtSec, DEAD_ZONE);

                    if (dx !== 0 || dy !== 0) {
                        const target = resolveScrollTarget(document.activeElement);
                        if (target) {
                            target.scrollBy({ top: dy, left: dx, behavior: 'auto' });
                        }
                    }
                }
            }

            animFrame = requestAnimationFrame(poll);
        };

        const start = () => {
            if (!isPolling) {
                isPolling = true;
                lastFrameTs = 0;
                animFrame = requestAnimationFrame(poll);
            }
        };

        const stop = () => {
            isPolling = false;
            if (animFrame) {
                cancelAnimationFrame(animFrame);
                animFrame = null;
            }
        };

        start();
        window.addEventListener('focus', start);
        window.addEventListener('blur', stop);

        return () => {
            stop();
            window.removeEventListener('focus', start);
            window.removeEventListener('blur', stop);
            if (instanceId === activeInstance) activeInstance = 0;
        };
    }, [disabled]);
}
