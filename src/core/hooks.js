/**
 * Maida 2.0 hooks state transitions.
 *
 * Pure functions over the hooks.json model:
 *   { hooks: [{ id, gameId, note, createdAt, status, traceEventId }],
 *     gameStates: { [gameId]: 'keep'|'rest'|'released' } }
 *
 * Each transition returns { nextState, traceEvents }. hooks.json stays the
 * state authority; the trace events are history only.
 */
import { buildTraceEvent, getWriterIdentity } from './trace.js';

export const GAME_STATES = ['keep', 'rest', 'released'];

export const EMPTY_HOOKS_STATE = { hooks: [], gameStates: {} };

function defaultBuildEvent(input) {
    return buildTraceEvent({ ...input, writer: getWriterIdentity() });
}

function normalize(state) {
    return {
        hooks: state?.hooks || [],
        gameStates: state?.gameStates || {},
    };
}

/**
 * Create a hook for a game. If the game already has an active hook, the old
 * one is marked retracted (reason: superseded) and the trace records
 * maida.hook.superseded pointing at the old hook's event.
 */
export function createHook(state, { gameId, note, title } = {}, buildEvent = defaultBuildEvent) {
    const s = normalize(state);
    if (!gameId || !note || typeof note !== 'string') {
        return { nextState: s, traceEvents: [] };
    }

    const existing = s.hooks.find(h => h.gameId === gameId && h.status === 'active');
    const event = buildEvent({
        eventType: existing ? 'maida.hook.superseded' : 'maida.hook.created',
        subjectId: gameId,
        displayTitle: title,
        supersedesEventId: existing ? existing.traceEventId : undefined,
        payload: { note },
    });

    const newHook = {
        id: crypto.randomUUID(),
        gameId,
        note,
        createdAt: new Date().toISOString(),
        status: 'active',
        traceEventId: event.eventId,
    };

    const hooks = existing
        ? s.hooks.map(h => (h.id === existing.id ? { ...h, status: 'retracted', retractReason: 'superseded' } : h))
        : s.hooks;

    return {
        nextState: { ...s, hooks: [...hooks, newHook] },
        traceEvents: [event],
    };
}

/**
 * Retract an active hook by id. No-op on unknown or already-retracted hooks.
 */
export function retractHook(state, hookId, buildEvent = defaultBuildEvent) {
    const s = normalize(state);
    const hook = s.hooks.find(h => h.id === hookId && h.status === 'active');
    if (!hook) {
        return { nextState: s, traceEvents: [] };
    }

    const event = buildEvent({
        eventType: 'maida.hook.retracted',
        subjectId: hook.gameId,
        retractsEventId: hook.traceEventId,
        payload: { hookId: hook.id },
    });

    return {
        nextState: {
            ...s,
            hooks: s.hooks.map(h => (h.id === hookId ? { ...h, status: 'retracted' } : h)),
        },
        traceEvents: [event],
    };
}

/**
 * Set a game's state ('keep'|'rest'|'released'). Invalid input is a no-op.
 */
export function setGameState(state, gameId, gameState, buildEvent = defaultBuildEvent) {
    const s = normalize(state);
    if (!gameId || !GAME_STATES.includes(gameState)) {
        return { nextState: s, traceEvents: [] };
    }

    const event = buildEvent({
        eventType: 'maida.game.state_set',
        subjectId: gameId,
        payload: { state: gameState },
    });

    return {
        nextState: { ...s, gameStates: { ...s.gameStates, [gameId]: gameState } },
        traceEvents: [event],
    };
}
