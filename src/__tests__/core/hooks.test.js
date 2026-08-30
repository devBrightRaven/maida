import { describe, it, expect } from 'vitest';
import { createHook, retractHook, setGameState, EMPTY_HOOKS_STATE } from '../../core/hooks.js';

// Pinned buildEvent so tests control identity and event ids.
function makeBuildEvent() {
    let n = 0;
    const calls = [];
    const buildEvent = (input) => {
        calls.push(input);
        // Mimic buildTraceEvent's envelope: subject.{namespace,id}, not subjectId.
        return {
            eventId: `evt-${n++}`,
            subject: { namespace: input.namespace || 'steam', id: String(input.subjectId) },
            ...input,
        };
    };
    buildEvent.calls = calls;
    return buildEvent;
}

function stateWithHook() {
    return {
        hooks: [{
            id: 'h-1',
            gameId: 'g-1',
            note: 'old note',
            createdAt: '2026-08-01T00:00:00.000Z',
            status: 'active',
            traceEventId: 'evt-old',
        }],
        gameStates: { 'g-9': 'rest' },
    };
}

describe('createHook', () => {
    it('creates an active hook and a maida.hook.created event', () => {
        const buildEvent = makeBuildEvent();
        const { nextState, traceEvents } = createHook(EMPTY_HOOKS_STATE, { gameId: 'g-1', note: 'try the DLC', title: 'Sekiro' }, buildEvent);
        expect(nextState.hooks).toHaveLength(1);
        const hook = nextState.hooks[0];
        expect(hook.gameId).toBe('g-1');
        expect(hook.note).toBe('try the DLC');
        expect(hook.status).toBe('active');
        expect(hook.traceEventId).toBe(traceEvents[0].eventId);
        expect(typeof hook.createdAt).toBe('string');
        expect(traceEvents).toHaveLength(1);
        expect(traceEvents[0].eventType).toBe('maida.hook.created');
        expect(buildEvent.calls[0]).toMatchObject({
            subjectId: 'g-1',
            displayTitle: 'Sekiro',
            payload: { note: 'try the DLC' },
        });
        expect(buildEvent.calls[0].supersedesEventId).toBeUndefined();
    });

    it('supersedes an existing active hook for the same game', () => {
        const state = stateWithHook();
        const buildEvent = makeBuildEvent();
        const { nextState, traceEvents } = createHook(state, { gameId: 'g-1', note: 'new note' }, buildEvent);

        expect(nextState.hooks).toHaveLength(2);
        const old = nextState.hooks.find(h => h.id === 'h-1');
        expect(old.status).toBe('retracted');
        expect(old.retractReason).toBe('superseded');
        const fresh = nextState.hooks.find(h => h.id !== 'h-1');
        expect(fresh.status).toBe('active');
        expect(fresh.note).toBe('new note');

        expect(traceEvents).toHaveLength(1);
        expect(traceEvents[0].eventType).toBe('maida.hook.superseded');
        expect(traceEvents[0].supersedesEventId).toBe('evt-old');
    });

    it('does not supersede hooks of other games or already-retracted hooks', () => {
        const state = {
            hooks: [
                { id: 'h-1', gameId: 'g-1', note: 'a', createdAt: 'x', status: 'retracted', traceEventId: 'e1' },
                { id: 'h-2', gameId: 'g-2', note: 'b', createdAt: 'x', status: 'active', traceEventId: 'e2' },
            ],
            gameStates: {},
        };
        const { nextState, traceEvents } = createHook(state, { gameId: 'g-1', note: 'again' }, makeBuildEvent());
        expect(traceEvents[0].eventType).toBe('maida.hook.created');
        expect(nextState.hooks.find(h => h.id === 'h-2').status).toBe('active');
    });

    it('does not mutate the input state', () => {
        const state = stateWithHook();
        const snapshot = JSON.parse(JSON.stringify(state));
        createHook(state, { gameId: 'g-1', note: 'new note' }, makeBuildEvent());
        expect(state).toEqual(snapshot);
    });

    it('tolerates null state', () => {
        const { nextState, traceEvents } = createHook(null, { gameId: 'g-1', note: 'n' }, makeBuildEvent());
        expect(nextState.hooks).toHaveLength(1);
        expect(traceEvents).toHaveLength(1);
    });

    it('is a no-op without gameId or note', () => {
        const buildEvent = makeBuildEvent();
        expect(createHook(EMPTY_HOOKS_STATE, { note: 'n' }, buildEvent).traceEvents).toEqual([]);
        expect(createHook(EMPTY_HOOKS_STATE, { gameId: 'g-1' }, buildEvent).traceEvents).toEqual([]);
        expect(createHook(EMPTY_HOOKS_STATE, {}, buildEvent).traceEvents).toEqual([]);
        expect(buildEvent.calls).toHaveLength(0);
    });
});

describe('retractHook', () => {
    it('marks the hook retracted and records maida.hook.retracted', () => {
        const state = stateWithHook();
        const { nextState, traceEvents } = retractHook(state, 'h-1', makeBuildEvent());
        expect(nextState.hooks[0].status).toBe('retracted');
        expect(traceEvents).toHaveLength(1);
        expect(traceEvents[0].eventType).toBe('maida.hook.retracted');
        expect(traceEvents[0].retractsEventId).toBe('evt-old');
        expect(traceEvents[0].subject.id).toBe('g-1');
    });

    it('is a no-op for unknown or already-retracted hooks', () => {
        const state = stateWithHook();
        expect(retractHook(state, 'nope', makeBuildEvent()).traceEvents).toEqual([]);
        const retracted = retractHook(state, 'h-1', makeBuildEvent()).nextState;
        expect(retractHook(retracted, 'h-1', makeBuildEvent()).traceEvents).toEqual([]);
    });

    it('does not mutate the input state and tolerates null', () => {
        const state = stateWithHook();
        const snapshot = JSON.parse(JSON.stringify(state));
        retractHook(state, 'h-1', makeBuildEvent());
        expect(state).toEqual(snapshot);
        expect(retractHook(null, 'h-1', makeBuildEvent()).nextState.hooks).toEqual([]);
    });
});

describe('setGameState', () => {
    it('sets each valid state and records maida.game.state_set', () => {
        for (const value of ['keep', 'rest', 'released']) {
            const { nextState, traceEvents } = setGameState(EMPTY_HOOKS_STATE, 'g-1', value, makeBuildEvent());
            expect(nextState.gameStates['g-1']).toBe(value);
            expect(traceEvents[0].eventType).toBe('maida.game.state_set');
            expect(traceEvents[0].payload).toEqual({ state: value });
        }
    });

    it('rejects invalid states as a no-op', () => {
        const buildEvent = makeBuildEvent();
        expect(setGameState(EMPTY_HOOKS_STATE, 'g-1', 'archived', buildEvent).traceEvents).toEqual([]);
        expect(setGameState(EMPTY_HOOKS_STATE, null, 'keep', buildEvent).traceEvents).toEqual([]);
        expect(buildEvent.calls).toHaveLength(0);
    });

    it('does not mutate the input state and tolerates null', () => {
        const state = stateWithHook();
        const snapshot = JSON.parse(JSON.stringify(state));
        const { nextState } = setGameState(state, 'g-1', 'rest', makeBuildEvent());
        expect(state).toEqual(snapshot);
        expect(nextState.gameStates['g-9']).toBe('rest'); // existing entries preserved
        expect(setGameState(null, 'g-1', 'keep', makeBuildEvent()).nextState.gameStates['g-1']).toBe('keep');
    });
});
