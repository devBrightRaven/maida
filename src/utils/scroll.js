/**
 * Scroll utilities for gamepad R-stick global scroll.
 *
 * getScrollableAncestor walks up from a starting element to find the
 * nearest ancestor that can actually scroll vertically (or horizontally).
 * The caller decides how to handle a null return — typical fallback is
 * document.scrollingElement.
 */

function canScroll(node, win) {
    if (!node || node.nodeType !== 1) return false;
    const style = win.getComputedStyle(node);
    const oy = style.overflowY;
    const ox = style.overflowX;
    const yScrollable = (oy === 'auto' || oy === 'scroll')
        && node.scrollHeight > node.clientHeight;
    const xScrollable = (ox === 'auto' || ox === 'scroll')
        && node.scrollWidth > node.clientWidth;
    return yScrollable || xScrollable;
}

/**
 * Find the nearest scrollable ancestor of `start` (inclusive).
 * Returns the element, or null if no scrollable ancestor exists.
 *
 * @param {Element|null} start - starting element (usually document.activeElement)
 * @param {Window} [win=window] - window object (injected for testing)
 * @returns {Element|null}
 */
export function getScrollableAncestor(start, win = typeof window !== 'undefined' ? window : null) {
    if (!win) return null;
    let node = start;
    while (node && node.nodeType === 1) {
        if (canScroll(node, win)) return node;
        node = node.parentElement;
    }
    return null;
}

/**
 * Resolve the scroll target: nearest scrollable ancestor, or fallback
 * to document.scrollingElement.
 */
export function resolveScrollTarget(start, doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null) {
    const ancestor = getScrollableAncestor(start, win);
    if (ancestor) return ancestor;
    return doc ? doc.scrollingElement : null;
}
