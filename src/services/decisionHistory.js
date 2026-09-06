import bridge from './bridge';
import { buildTraceEvent, getWriterIdentity } from '../core/trace';

// Serialize writes across all views. Failed writes stay ahead of later events.
// The warning remains visible until a retry succeeds; it is not a saved receipt.
let pending = [];
let running = null;
let failure = false;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());
export const subscribeTraceStatus = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getTraceFailure = () => failure;

export function appendTraceEvents(events = []) {
    pending.push(...events);
    if (running) return running;
    running = (async () => {
        while (pending.length) {
            try {
                await bridge.appendTrace(pending[0]);
                pending.shift();
            } catch {
                failure = true;
                notify();
                return false;
            }
        }
        failure = false;
        notify();
        return true;
    })().finally(() => { running = null; });
    return running;
}

export function recordMicroChoice(game, action, extra = {}) {
    if (!game) return null;
    const event = buildTraceEvent({
        eventType: 'maida.choice.recorded',
        subjectId: game.steamAppId != null ? String(game.steamAppId) : game.id,
        namespace: game.steamAppId != null ? 'steam' : 'maida',
        displayTitle: game.title,
        writer: getWriterIdentity(),
        payload: { action, ...extra },
    });
    void appendTraceEvents([event]);
    return event;
}

export function historySubject(game) {
    return game ? {
        namespace: game.steamAppId != null ? 'steam' : 'maida',
        id: String(game.steamAppId != null ? game.steamAppId : game.id),
    } : null;
}
