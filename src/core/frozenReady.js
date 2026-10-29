// Frozen-screen "ready" line: one of FROZEN_READY_KEYS, picked once per mount.
// i18n t() has no array support, so the pool is numbered keys in every locale.
export const FROZEN_READY_KEYS = [
    'ui.status.frozen_ready_1',
    'ui.status.frozen_ready_2',
    'ui.status.frozen_ready_3',
    'ui.status.frozen_ready_4',
    'ui.status.frozen_ready_5',
];

export function pickFrozenReadyKey(rand = Math.random) {
    const i = Math.floor(rand() * FROZEN_READY_KEYS.length);
    return FROZEN_READY_KEYS[Math.min(Math.max(i, 0), FROZEN_READY_KEYS.length - 1)];
}
