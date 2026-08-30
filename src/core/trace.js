/**
 * Maida 2.0 trace event builder (TraceEventV1).
 *
 * Pure envelope construction + writer identity management.
 * hooks.json is the state authority; trace.jsonl is history only.
 */
import { version } from '../../package.json';

export const WRITER_ID_KEY = 'maida2-writer-id';
export const WRITER_SEQ_KEY = 'maida2-writer-seq';

// The 7 allowed event types and their fixed authority/provenance kinds.
// Maida never emits 'inference' / 'ai_hypothesis'.
export const EVENT_KINDS = {
    'maida.hook.created': { authorityKind: 'human_intent', provenanceKind: 'user_stated' },
    'maida.hook.superseded': { authorityKind: 'human_intent', provenanceKind: 'user_stated' },
    'maida.hook.retracted': { authorityKind: 'human_intent', provenanceKind: 'user_stated' },
    'maida.game.state_set': { authorityKind: 'human_state', provenanceKind: 'user_stated' },
    'maida.launch.initiated': { authorityKind: 'observed_behavior', provenanceKind: 'observed_interaction' },
    'maida.decision.presented': { authorityKind: 'observed_behavior', provenanceKind: 'computed_observation' },
    'maida.playtime.snapshot': { authorityKind: 'observed_behavior', provenanceKind: 'imported_fact' },
};

/**
 * Build a TraceEventV1. Pure apart from randomUUID/now.
 *
 * input: {
 *   eventType, subjectId, writer: { writerId, seq }, payload,
 *   namespace?,  // subject namespace: 'steam' (default, id = appid) or 'maida' (slug / boot-level id)
 *   displayTitle?, occurredAt?, supersedesEventId?, retractsEventId?,
 *   authorityKind?, provenanceKind?  // optional; must match the table if given
 * }
 */
export function buildTraceEvent(input) {
    const { eventType, subjectId, writer, payload } = input || {};
    const kinds = EVENT_KINDS[eventType];
    if (!kinds) {
        throw new Error(`unknown trace event type: ${eventType}`);
    }
    if (input.authorityKind === 'inference' || input.provenanceKind === 'ai_hypothesis') {
        throw new Error('Maida events never use inference/ai_hypothesis');
    }
    if (input.authorityKind != null && input.authorityKind !== kinds.authorityKind) {
        throw new Error(`authorityKind mismatch for ${eventType}: ${input.authorityKind}`);
    }
    if (input.provenanceKind != null && input.provenanceKind !== kinds.provenanceKind) {
        throw new Error(`provenanceKind mismatch for ${eventType}: ${input.provenanceKind}`);
    }
    if (!writer || typeof writer.writerId !== 'string' || !Number.isInteger(writer.seq)) {
        throw new Error('writer identity required: { writerId, seq }');
    }
    if (subjectId == null) {
        throw new Error('subjectId required');
    }

    const event = {
        schemaVersion: 1,
        eventId: crypto.randomUUID(),
        eventType,
        producer: {
            appId: 'maida',
            writerId: writer.writerId,
            appVersion: version,
            seq: writer.seq,
        },
        subject: { namespace: input.namespace || 'steam', id: String(subjectId) },
        authorityKind: kinds.authorityKind,
        provenanceKind: kinds.provenanceKind,
        recordedAt: new Date().toISOString(),
        payload: payload || {},
    };
    if (input.displayTitle) event.entity = { displayTitle: input.displayTitle };
    if (input.occurredAt) event.occurredAt = input.occurredAt;
    if (input.supersedesEventId) event.supersedesEventId = input.supersedesEventId;
    if (input.retractsEventId) event.retractsEventId = input.retractsEventId;
    return event;
}

function defaultStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null; // node test env has none
    }
}

/**
 * Read-and-increment the writer identity.
 * Missing/corrupt writerId or seq -> NEW writerId + seq reset to 0 (never guess).
 * Returns { writerId, seq } for the event being written.
 */
export function getWriterIdentity(storage = defaultStorage()) {
    let writerId = null;
    let seq = null;
    try {
        if (storage) {
            writerId = storage.getItem(WRITER_ID_KEY);
            // Strict digits-only: parseInt would accept corrupt prefixes ('17garbage' -> 17).
            const rawSeq = storage.getItem(WRITER_SEQ_KEY);
            seq = typeof rawSeq === 'string' && /^\d+$/.test(rawSeq) ? Number.parseInt(rawSeq, 10) : null;
        }
    } catch {
        writerId = null;
        seq = null;
    }

    if (typeof writerId !== 'string' || writerId.length === 0 || !Number.isInteger(seq) || seq < 0) {
        writerId = crypto.randomUUID();
        seq = 0;
    }

    try {
        if (storage) {
            storage.setItem(WRITER_ID_KEY, writerId);
            storage.setItem(WRITER_SEQ_KEY, String(seq + 1));
        }
    } catch {
        // storage unavailable: identity is ephemeral for this session
    }
    return { writerId, seq };
}
