import { describe, it, expect } from 'vitest';
import { pickPostLaunch, GENERIC_ALLOWLIST } from '../../core/prescriptionPicker.js';
import prescriptionsData from '../../data/prescriptions.json';

const entry = (id, tier = 0) => ({ id, tier, kernel: `${id}-kernel` });

const data = {
    default: [
        entry('entry-permitted'),      // not on the allowlist
        entry('no-optimization'),
        entry('safe-exit'),
        entry('short-burst'),
    ],
    catalog: {
        'sekiro-shadows-die-twice': [entry('muscle-memory', 2), entry('death-loop', 2)],
    },
};

describe('pickPostLaunch', () => {
    it('puts exact-slug catalog entries first, then allowlisted generics in allowlist order', () => {
        const { list } = pickPostLaunch(data, { slug: 'sekiro-shadows-die-twice', seedIndex: 0 });
        expect(list.map(p => p.id)).toEqual([
            'muscle-memory',
            'death-loop',
            'no-optimization',
            'safe-exit',
            'short-burst',
        ]);
    });

    it('excludes default entries not on the allowlist', () => {
        const { list } = pickPostLaunch(data, { slug: 'unknown-game', seedIndex: 0 });
        expect(list.map(p => p.id)).not.toContain('entry-permitted');
    });

    it('falls back to generics only for an unknown slug', () => {
        const { list, pick } = pickPostLaunch(data, { slug: 'unknown-game', seedIndex: 0 });
        expect(list.map(p => p.id)).toEqual(['no-optimization', 'safe-exit', 'short-burst']);
        expect(pick.id).toBe('no-optimization');
    });

    it('picks by seedIndex modulo list length (wraps)', () => {
        const opts = { slug: 'sekiro-shadows-die-twice' };
        expect(pickPostLaunch(data, { ...opts, seedIndex: 1 }).pick.id).toBe('death-loop');
        expect(pickPostLaunch(data, { ...opts, seedIndex: 5 }).pick.id).toBe('muscle-memory');
        expect(pickPostLaunch(data, { ...opts, seedIndex: 7 }).pick.id).toBe('no-optimization');
    });

    it('is deterministic: same input, same output', () => {
        const a = pickPostLaunch(data, { slug: 'sekiro-shadows-die-twice', seedIndex: 3 });
        const b = pickPostLaunch(data, { slug: 'sekiro-shadows-die-twice', seedIndex: 3 });
        expect(a).toEqual(b);
    });

    it('tolerates null/empty prescriptions data', () => {
        expect(pickPostLaunch(null, { slug: 'x', seedIndex: 0 })).toEqual({ list: [], pick: null });
        expect(pickPostLaunch({}, { slug: 'x', seedIndex: 0 })).toEqual({ list: [], pick: null });
        expect(pickPostLaunch({ default: null, catalog: null }, { slug: 'x' })).toEqual({ list: [], pick: null });
    });

    it('tolerates missing options and non-integer seedIndex', () => {
        const { pick } = pickPostLaunch(data);
        expect(pick.id).toBe('no-optimization'); // no slug -> generics, seed defaults to 0
        expect(pickPostLaunch(data, { seedIndex: 1.5 }).pick.id).toBe('no-optimization');
        expect(pickPostLaunch(data, { seedIndex: -1 }).pick.id).toBe('short-burst'); // wraps negatives
    });

    it('skips malformed default entries without an id', () => {
        const messy = { default: [null, {}, entry('safe-exit')], catalog: {} };
        const { list } = pickPostLaunch(messy, { seedIndex: 0 });
        expect(list.map(p => p.id)).toEqual(['safe-exit']);
    });

    it('does not mutate the input data', () => {
        const snapshot = JSON.parse(JSON.stringify(data));
        pickPostLaunch(data, { slug: 'sekiro-shadows-die-twice', seedIndex: 2 });
        expect(data).toEqual(snapshot);
    });

    it('resolves every GENERIC_ALLOWLIST id against the real prescriptions data', () => {
        const { list } = pickPostLaunch(prescriptionsData.prescriptions, { seedIndex: 0 });
        const ids = list.map(p => p.id);
        for (const id of GENERIC_ALLOWLIST) {
            expect(ids).toContain(id);
        }
    });

    it('allowlist covers the hand-curated generic ids', () => {
        expect(GENERIC_ALLOWLIST).toContain('no-optimization');
        expect(GENERIC_ALLOWLIST).toContain('generic-action');
        expect(GENERIC_ALLOWLIST).toHaveLength(10);
    });
});
