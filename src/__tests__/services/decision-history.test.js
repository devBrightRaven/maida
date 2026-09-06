import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../services/bridge', () => ({ default: { appendTrace: vi.fn() } }));

describe('Decision History writes', () => {
    beforeEach(() => { vi.resetModules(); });
    it('serializes concurrent batches without writing later events first', async () => {
        const bridge = (await import('../../services/bridge')).default;
        let release;
        bridge.appendTrace.mockReset().mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(undefined);
        const { appendTraceEvents } = await import('../../services/decisionHistory');
        const first = appendTraceEvents([{ eventId: 'one' }]);
        const second = appendTraceEvents([{ eventId: 'two' }]);
        expect(bridge.appendTrace.mock.calls).toEqual([[{ eventId: 'one' }]]);
        release();
        await Promise.all([first, second]);
        expect(bridge.appendTrace.mock.calls).toEqual([[{ eventId: 'one' }], [{ eventId: 'two' }]]);
    });
    it('exposes failed writes and retries the same event before later events', async () => {
        const bridge = (await import('../../services/bridge')).default;
        bridge.appendTrace.mockReset().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
        const { appendTraceEvents, getTraceFailure, subscribeTraceStatus } = await import('../../services/decisionHistory');
        const listener = vi.fn(); const unsubscribe = subscribeTraceStatus(listener);
        await expect(appendTraceEvents([{ eventId: 'one' }])).resolves.toBe(false);
        expect(getTraceFailure()).toBe(true);
        await expect(appendTraceEvents([{ eventId: 'two' }])).resolves.toBe(true);
        expect(getTraceFailure()).toBe(false);
        expect(bridge.appendTrace.mock.calls.map(([e]) => e.eventId)).toEqual(['one', 'one', 'two']);
        expect(listener).toHaveBeenCalledTimes(2); unsubscribe();
    });
    it('records micro choices as observations with stable game identity, never inferred intent', async () => {
        const bridge = (await import('../../services/bridge')).default;
        bridge.appendTrace.mockReset().mockResolvedValue(undefined);
        const { recordMicroChoice, appendTraceEvents, historySubject } = await import('../../services/decisionHistory');
        const game = { id: 'internal-1', steamAppId: 367520, title: 'Hollow Knight' };
        const e = recordMicroChoice(game, 'not_now');
        expect(e.subject).toEqual({ namespace: 'steam', id: '367520' });
        expect(e.authorityKind).toBe('observed_behavior');
        expect(e.provenanceKind).toBe('observed_interaction');
        expect(e.payload).toEqual({ action: 'not_now' });
        expect(historySubject({ id: 'shortcut' })).toEqual({ namespace: 'maida', id: 'shortcut' });
        await appendTraceEvents();
    });
});
