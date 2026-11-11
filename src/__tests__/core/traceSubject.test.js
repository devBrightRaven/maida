import { describe, expect, it, vi } from 'vitest';
import { traceSubjectOf } from '../../core/traceSubject';

vi.mock('../../services/bridge', () => ({ default: { appendTrace: vi.fn() } }));

describe('traceSubjectOf', () => {
    it('plain Steam record reports steam + appid, as before', () => {
        expect(traceSubjectOf({ id: 'hades', steamAppId: '1145360' })).toEqual({ namespace: 'steam', id: '1145360' });
        expect(traceSubjectOf({ id: 'x', steamAppId: 10 })).toEqual({ namespace: 'steam', id: '10' });
    });

    it('plain manual record reports maida + id, as before', () => {
        expect(traceSubjectOf({ id: 'my-game' })).toEqual({ namespace: 'maida', id: 'my-game' });
        expect(traceSubjectOf({ id: 'my-game', steamAppId: null })).toEqual({ namespace: 'maida', id: 'my-game' });
    });

    it('stored traceSubject wins over a later-attached steamAppId', () => {
        const game = {
            id: 'epic:abc',
            steamAppId: '504230',
            traceSubject: { namespace: 'maida', id: 'epic:abc' },
        };
        expect(traceSubjectOf(game)).toEqual({ namespace: 'maida', id: 'epic:abc' });
    });

    it('returns null without a game and ignores a malformed stored subject', () => {
        expect(traceSubjectOf(null)).toBeNull();
        expect(traceSubjectOf({ id: 'a', traceSubject: { namespace: '', id: 'z' } })).toEqual({ namespace: 'maida', id: 'a' });
    });

    it('historySubject and recordMicroChoice use the stored subject', async () => {
        const { historySubject, recordMicroChoice } = await import('../../services/decisionHistory');
        const game = { id: 'epic:abc', title: 'T', steamAppId: '9', traceSubject: { namespace: 'maida', id: 'epic:abc' } };
        expect(historySubject(game)).toEqual({ namespace: 'maida', id: 'epic:abc' });
        expect(historySubject(null)).toBeNull();
        const ev = recordMicroChoice(game, 'visit');
        expect(ev.subject).toEqual({ namespace: 'maida', id: 'epic:abc' });
    });
});
