import { describe, it, expect } from 'vitest';
import { getScrollableAncestor, resolveScrollTarget } from '../../utils/scroll';

/**
 * Build a fake element chain where node[0] is deepest (child) and the last
 * node is the outermost parent. Each element has overflow/scroll metrics
 * configurable per node.
 */
function makeChain(specs) {
    const nodes = specs.map((spec) => ({
        nodeType: 1,
        tagName: 'DIV',
        scrollHeight: spec.scrollHeight ?? 0,
        clientHeight: spec.clientHeight ?? 0,
        scrollWidth: spec.scrollWidth ?? 0,
        clientWidth: spec.clientWidth ?? 0,
        _overflowY: spec.overflowY ?? 'visible',
        _overflowX: spec.overflowX ?? 'visible',
        parentElement: null,
    }));
    // Link parent pointers: index 0 is child, index N-1 is root
    for (let i = 0; i < nodes.length - 1; i++) {
        nodes[i].parentElement = nodes[i + 1];
    }
    const fakeWin = {
        getComputedStyle(node) {
            return { overflowY: node._overflowY, overflowX: node._overflowX };
        },
    };
    return { nodes, win: fakeWin };
}

describe('getScrollableAncestor', () => {
    it('returns the starting element when it is scrollable', () => {
        const { nodes, win } = makeChain([
            { overflowY: 'auto', scrollHeight: 400, clientHeight: 200 },
        ]);
        expect(getScrollableAncestor(nodes[0], win)).toBe(nodes[0]);
    });

    it('walks up to find the first scrollable ancestor', () => {
        const { nodes, win } = makeChain([
            { overflowY: 'visible' },
            { overflowY: 'visible' },
            { overflowY: 'auto', scrollHeight: 800, clientHeight: 400 },
        ]);
        expect(getScrollableAncestor(nodes[0], win)).toBe(nodes[2]);
    });

    it('returns null when no ancestor is scrollable', () => {
        const { nodes, win } = makeChain([
            { overflowY: 'visible' },
            { overflowY: 'hidden' },
        ]);
        expect(getScrollableAncestor(nodes[0], win)).toBeNull();
    });

    it('treats overflow-y:scroll the same as auto', () => {
        const { nodes, win } = makeChain([
            { overflowY: 'scroll', scrollHeight: 500, clientHeight: 200 },
        ]);
        expect(getScrollableAncestor(nodes[0], win)).toBe(nodes[0]);
    });

    it('does not count overflow:auto when content does not exceed viewport', () => {
        // overflow:auto but scrollHeight === clientHeight means nothing to scroll
        const { nodes, win } = makeChain([
            { overflowY: 'auto', scrollHeight: 200, clientHeight: 200 },
            { overflowY: 'auto', scrollHeight: 800, clientHeight: 400 },
        ]);
        expect(getScrollableAncestor(nodes[0], win)).toBe(nodes[1]);
    });

    it('accepts horizontal overflow as scrollable', () => {
        const { nodes, win } = makeChain([
            { overflowX: 'auto', scrollWidth: 900, clientWidth: 300 },
        ]);
        expect(getScrollableAncestor(nodes[0], win)).toBe(nodes[0]);
    });

    it('returns null for null start', () => {
        const fakeWin = { getComputedStyle: () => ({ overflowY: 'visible', overflowX: 'visible' }) };
        expect(getScrollableAncestor(null, fakeWin)).toBeNull();
    });

    it('returns null when window is missing', () => {
        expect(getScrollableAncestor({ nodeType: 1 }, null)).toBeNull();
    });
});

describe('resolveScrollTarget', () => {
    it('returns the ancestor when one is scrollable', () => {
        const { nodes, win } = makeChain([
            { overflowY: 'auto', scrollHeight: 500, clientHeight: 200 },
        ]);
        const fakeDoc = { scrollingElement: { id: 'root' } };
        expect(resolveScrollTarget(nodes[0], fakeDoc, win)).toBe(nodes[0]);
    });

    it('falls back to document.scrollingElement when no ancestor scrolls', () => {
        const { nodes, win } = makeChain([{ overflowY: 'visible' }]);
        const scrollingRoot = { id: 'root' };
        const fakeDoc = { scrollingElement: scrollingRoot };
        expect(resolveScrollTarget(nodes[0], fakeDoc, win)).toBe(scrollingRoot);
    });

    it('returns null when both fail', () => {
        expect(resolveScrollTarget(null, null, null)).toBeNull();
    });
});
