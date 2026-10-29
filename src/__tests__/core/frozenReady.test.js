import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { FROZEN_READY_KEYS, pickFrozenReadyKey } from '../../core/frozenReady';
import en from '../../i18n/en.json';
import ja from '../../i18n/ja.json';
import zhCN from '../../i18n/zh-CN.json';
import zhTW from '../../i18n/zh-TW.json';

describe('pickFrozenReadyKey', () => {
    it('always returns a key from the pool, including rand edge values', () => {
        for (const r of [0, 0.19, 0.2, 0.5, 0.999999, 1]) {
            expect(FROZEN_READY_KEYS).toContain(pickFrozenReadyKey(() => r));
        }
        for (let n = 0; n < 200; n++) {
            expect(FROZEN_READY_KEYS).toContain(pickFrozenReadyKey());
        }
    });

    it('reaches every pool entry', () => {
        const seen = new Set(FROZEN_READY_KEYS.map((_, i) => pickFrozenReadyKey(() => i / FROZEN_READY_KEYS.length)));
        expect(seen.size).toBe(FROZEN_READY_KEYS.length);
    });

    it('is picked once when held in a lazy useState initializer', () => {
        let calls = 0;
        function Probe() {
            const [key] = React.useState(() => { calls++; return pickFrozenReadyKey(); });
            return React.createElement('p', null, key);
        }
        const html = renderToString(React.createElement(Probe));
        expect(FROZEN_READY_KEYS.some(k => html.includes(k))).toBe(true);
        expect(calls).toBe(1);
    });

    it('every pool key exists in all four locales', () => {
        for (const loc of [en, ja, zhCN, zhTW]) {
            for (const k of FROZEN_READY_KEYS) {
                expect(typeof loc.ui.status[k.split('.').pop()]).toBe('string');
            }
        }
    });
});
