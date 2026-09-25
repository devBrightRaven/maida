// Sidebar symbol "bloom" (Maida 2.0 P1, 2026-09-25): a decorative ghost copy
// of a hovered/focused mode symbol that grows from the symbol's centre past
// the whole viewport while blurring and fading out, then is removed.
//
// Imperative on purpose: the ghost lives in one fixed layer appended to
// <body>, so no ancestor transform/overflow can clip it, and the module can
// guarantee at most one ghost alive at a time across view remounts.
// Decorative only: aria-hidden + inert layer, pointer-events none, never
// focusable. Animates transform / opacity / filter only.

// The "Large motion effects" toggle is a debug control (user ruling
// 2026-09-26): shown and honoured only in dev builds. Production has no
// app-level motion toggle, so bloom follows the OS reduce-motion setting
// alone and AGENTS.md red line 7.6 stays intact.
export const LARGE_MOTION_SETTING_ENABLED = import.meta.env.DEV;

export const BLOOM_DEBOUNCE_MS = 250;
export const BLOOM_DURATION_MS = 900;
// Lowered 0.35 -> 0.22 and the reach capped below after user review
// (2026-09-25): the full-viewport bloom felt too intense.
export const BLOOM_START_OPACITY = 0.22;
// Maximum ring radius in CSS px. Roughly the sidebar plus a little of the
// content column at 1280x800, instead of past every viewport corner.
export const BLOOM_MAX_RADIUS_PX = 280;
// Screen-space blur at the end of the animation. Specified ~40px; measured
// at 1280x800 in headless Chromium (rAF sampling, 2026-09-25) the mean frame
// rate across a bloom was ~43-51fps at 40px, ~45-57 at 24px and ~53-59 at
// 12px (per-bloom median 60 in every case), so it was reduced to 12px.
export const BLOOM_END_BLUR_PX = 12;
// How far past the farthest viewport corner the ring travels.
const BLOOM_OVERSHOOT = 1.1;
// The drawn shapes span roughly 70% of the 20x20 viewBox.
const SHAPE_FRACTION = 0.7;

/**
 * Effective gate. The OS reduce-motion preference always wins; the app
 * setting can only turn motion off, never on (one-way opt-out).
 */
export function shouldPlayBloom({ osReducedMotion, largeMotion }) {
    return !osReducedMotion && largeMotion === true;
}

/**
 * Scale that carries a symbol of `size` px centred at (cx, cy) out to
 * BLOOM_MAX_RADIUS_PX, or past every corner of a `vw` x `vh` viewport if
 * that is closer.
 */
export function bloomEndScale({ cx, cy, size, vw, vh }) {
    if (!(size > 0)) return 1;
    const far = Math.max(
        Math.hypot(cx, cy),
        Math.hypot(vw - cx, cy),
        Math.hypot(cx, vh - cy),
        Math.hypot(vw - cx, vh - cy),
    );
    const radius = Math.min(far * BLOOM_OVERSHOOT, BLOOM_MAX_RADIUS_PX);
    return Math.max(1, (2 * radius) / (size * SHAPE_FRACTION));
}

const BLOOM_KEYFRAME_STEPS = 16;

/**
 * Sampled keyframes (played with linear easing between samples).
 * Growth eases in (quadratic) so the ring is seen leaving the symbol and
 * crossing the screen; an ease-out put it off-screen within ~60ms. Screen
 * blur rises linearly 0 -> BLOOM_END_BLUR_PX: the filter runs in the ghost's
 * local space before the scale, so each sample divides by that sample's
 * scale. Opacity fades late so the ring stays readable most of the way.
 */
export function bloomKeyframes(endScale, steps = BLOOM_KEYFRAME_STEPS) {
    return Array.from({ length: steps + 1 }, (_, i) => {
        const p = i / steps;
        const scale = 1 + (endScale - 1) * p * p;
        return {
            offset: p,
            transform: `scale(${scale})`,
            opacity: BLOOM_START_OPACITY * (1 - p ** 1.6),
            filter: `blur(${(BLOOM_END_BLUR_PX * p) / scale}px)`,
        };
    });
}

let pendingTimer = null;
let activeGhost = null;
let layer = null;

function osReducesMotion() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function removeActiveGhost() {
    if (activeGhost) {
        activeGhost.remove();
        activeGhost = null;
    }
}

function getLayer() {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement('div');
    layer.className = 'mode-bloom-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('inert', '');
    document.body.appendChild(layer);
    return layer;
}

function playBloom(faceId) {
    // Re-check the OS preference at play time: it can flip while pending.
    if (osReducesMotion()) return;
    const svg = document.querySelector(`.mode-navigation [data-face="${faceId}"] .mode-navigation__symbol svg`);
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    removeActiveGhost();
    const ghost = document.createElement('div');
    ghost.className = 'mode-bloom-ghost';
    ghost.dataset.bloomFace = faceId;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    const copy = svg.cloneNode(true);
    copy.setAttribute('focusable', 'false');
    copy.setAttribute('aria-hidden', 'true');
    ghost.appendChild(copy);
    getLayer().appendChild(ghost);
    activeGhost = ghost;

    const endScale = bloomEndScale({
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        size: Math.min(rect.width, rect.height),
        vw: window.innerWidth,
        vh: window.innerHeight,
    });
    const cleanup = () => {
        if (activeGhost === ghost) activeGhost = null;
        ghost.remove();
    };
    if (typeof ghost.animate !== 'function') { cleanup(); return; }
    const animation = ghost.animate(bloomKeyframes(endScale), {
        duration: BLOOM_DURATION_MS,
        easing: 'linear',
        fill: 'forwards',
    });
    animation.finished.then(cleanup, cleanup);
    // Safety net if the animation is never ticked (hidden tab, detached layer).
    setTimeout(cleanup, BLOOM_DURATION_MS + 300);
}

/**
 * Request a bloom for a face's symbol. Trailing debounce: triggers that
 * arrive within BLOOM_DEBOUNCE_MS of each other (D-pad scrolling) collapse
 * into one bloom for the last face.
 */
export function scheduleBloom(faceId) {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
        pendingTimer = null;
        playBloom(faceId);
    }, BLOOM_DEBOUNCE_MS);
}

/** Drop any pending bloom and remove a ghost that is still playing. */
export function cancelBloom() {
    if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
    }
    removeActiveGhost();
}
