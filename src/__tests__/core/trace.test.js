import { describe, it, expect } from 'vitest';
import { version } from '../../../package.json';
import {
    EVENT_KINDS,
    WRITER_ID_KEY,
    WRITER_SEQ_KEY,
    buildTraceEvent,
    getWriterIdentity,
} from '../../core/trace.js';

const writer = { writerId: 'w-1', seq: 7 };

function makeStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        map,
    };
}

describe('buildTraceEvent', () => {
    it('builds the full envelope', () => {
        const e = buildTraceEvent({
            eventType: 'maida.hook.created',
            subjectId: 12345,
            writer,
            displayTitle: 'Sekiro',
            payload: { note: 'reach the next idol' },
        });
        expect(e.schemaVersion).toBe(1);
        expect(typeof e.eventId).toBe('string');
        expect(e.eventType).toBe('maida.hook.created');
        expect(e.producer).toEqual({ appId: 'maida', writerId: 'w-1', appVersion: version, seq: 7 });
        expect(e.subject).toEqual({ namespace: 'steam', id: '12345' });
        expect(e.entity).toEqual({ displayTitle: 'Sekiro' });
        expect(e.authorityKind).toBe('human_intent');
        expect(e.provenanceKind).toBe('user_stated');
        expect(new Date(e.recordedAt).toISOString()).toBe(e.recordedAt);
        expect(e.payload).toEqual({ note: 'reach the next idol' });
    });

    it('assigns the mapped kinds for every allowed event type', () => {
        for (const [eventType, kinds] of Object.entries(EVENT_KINDS)) {
            const e = buildTraceEvent({ eventType, subjectId: '1', writer, payload: {} });
            expect(e.authorityKind).toBe(kinds.authorityKind);
            expect(e.provenanceKind).toBe(kinds.provenanceKind);
            expect(e.authorityKind).not.toBe('inference');
            expect(e.provenanceKind).not.toBe('ai_hypothesis');
        }
    });

    it('defaults the subject namespace to steam and honors an explicit one', () => {
        const steam = buildTraceEvent({ eventType: 'maida.launch.initiated', subjectId: 105600, writer });
        expect(steam.subject).toEqual({ namespace: 'steam', id: '105600' });
        const boot = buildTraceEvent({
            eventType: 'maida.decision.presented',
            subjectId: 'library',
            namespace: 'maida',
            writer,
        });
        expect(boot.subject).toEqual({ namespace: 'maida', id: 'library' });
    });

    it('throws on unknown event type', () => {
        expect(() => buildTraceEvent({ eventType: 'maida.mystery', subjectId: '1', writer }))
            .toThrow(/unknown trace event type/);
    });

    it('throws on inference / ai_hypothesis', () => {
        expect(() => buildTraceEvent({ eventType: 'maida.hook.created', subjectId: '1', writer, authorityKind: 'inference' }))
            .toThrow(/never use inference/);
        expect(() => buildTraceEvent({ eventType: 'maida.hook.created', subjectId: '1', writer, provenanceKind: 'ai_hypothesis' }))
            .toThrow(/never use inference/);
    });

    it('throws when supplied kinds contradict the mapping table', () => {
        expect(() => buildTraceEvent({ eventType: 'maida.hook.created', subjectId: '1', writer, authorityKind: 'human_state' }))
            .toThrow(/authorityKind mismatch/);
        expect(() => buildTraceEvent({ eventType: 'maida.launch.initiated', subjectId: '1', writer, provenanceKind: 'user_stated' }))
            .toThrow(/provenanceKind mismatch/);
    });

    it('accepts kinds that match the table', () => {
        const e = buildTraceEvent({
            eventType: 'maida.playtime.snapshot',
            subjectId: '1',
            writer,
            authorityKind: 'observed_behavior',
            provenanceKind: 'imported_fact',
        });
        expect(e.authorityKind).toBe('observed_behavior');
    });

    it('throws without writer identity or subject', () => {
        expect(() => buildTraceEvent({ eventType: 'maida.hook.created', subjectId: '1' })).toThrow(/writer identity/);
        expect(() => buildTraceEvent({ eventType: 'maida.hook.created', subjectId: '1', writer: { writerId: 'w', seq: 'x' } })).toThrow(/writer identity/);
        expect(() => buildTraceEvent({ eventType: 'maida.hook.created', writer })).toThrow(/subjectId required/);
    });

    it('includes optional fields only when given', () => {
        const bare = buildTraceEvent({ eventType: 'maida.hook.created', subjectId: '1', writer });
        expect(bare).not.toHaveProperty('entity');
        expect(bare).not.toHaveProperty('occurredAt');
        expect(bare).not.toHaveProperty('supersedesEventId');
        expect(bare).not.toHaveProperty('retractsEventId');
        expect(bare.payload).toEqual({});

        const full = buildTraceEvent({
            eventType: 'maida.hook.superseded',
            subjectId: '1',
            writer,
            occurredAt: '2026-08-30T00:00:00.000Z',
            supersedesEventId: 'evt-old',
        });
        expect(full.occurredAt).toBe('2026-08-30T00:00:00.000Z');
        expect(full.supersedesEventId).toBe('evt-old');

        const retract = buildTraceEvent({
            eventType: 'maida.hook.retracted',
            subjectId: '1',
            writer,
            retractsEventId: 'evt-old',
        });
        expect(retract.retractsEventId).toBe('evt-old');
    });

    it('generates unique eventIds', () => {
        const a = buildTraceEvent({ eventType: 'maida.hook.created', subjectId: '1', writer });
        const b = buildTraceEvent({ eventType: 'maida.hook.created', subjectId: '1', writer });
        expect(a.eventId).not.toBe(b.eventId);
    });
});

describe('getWriterIdentity', () => {
    it('generates a fresh identity on empty storage and persists it', () => {
        const storage = makeStorage();
        const id = getWriterIdentity(storage);
        expect(typeof id.writerId).toBe('string');
        expect(id.seq).toBe(0);
        expect(storage.map.get(WRITER_ID_KEY)).toBe(id.writerId);
        expect(storage.map.get(WRITER_SEQ_KEY)).toBe('1');
    });

    it('increments seq monotonically across calls with a stable writerId', () => {
        const storage = makeStorage();
        const a = getWriterIdentity(storage);
        const b = getWriterIdentity(storage);
        const c = getWriterIdentity(storage);
        expect(b.writerId).toBe(a.writerId);
        expect(c.writerId).toBe(a.writerId);
        expect([a.seq, b.seq, c.seq]).toEqual([0, 1, 2]);
    });

    it('resets to a NEW writerId + seq 0 when seq is corrupt', () => {
        const storage = makeStorage({ [WRITER_ID_KEY]: 'w-old', [WRITER_SEQ_KEY]: 'not-a-number' });
        const id = getWriterIdentity(storage);
        expect(id.writerId).not.toBe('w-old');
        expect(id.seq).toBe(0);
    });

    it('resets on a corrupt seq with a numeric prefix (17garbage is not 17)', () => {
        const storage = makeStorage({ [WRITER_ID_KEY]: 'w-old', [WRITER_SEQ_KEY]: '17garbage' });
        const id = getWriterIdentity(storage);
        expect(id.writerId).not.toBe('w-old');
        expect(id.seq).toBe(0);
    });

    it('resets when seq is negative', () => {
        const storage = makeStorage({ [WRITER_ID_KEY]: 'w-old', [WRITER_SEQ_KEY]: '-3' });
        const id = getWriterIdentity(storage);
        expect(id.writerId).not.toBe('w-old');
        expect(id.seq).toBe(0);
    });

    it('resets when writerId is missing but seq is valid', () => {
        const storage = makeStorage({ [WRITER_SEQ_KEY]: '5' });
        const id = getWriterIdentity(storage);
        expect(typeof id.writerId).toBe('string');
        expect(id.seq).toBe(0);
    });

    it('survives a storage that throws (ephemeral identity)', () => {
        const storage = {
            getItem: () => { throw new Error('denied'); },
            setItem: () => { throw new Error('denied'); },
        };
        const id = getWriterIdentity(storage);
        expect(typeof id.writerId).toBe('string');
        expect(id.seq).toBe(0);
    });

    it('works with no storage at all (node env)', () => {
        const id = getWriterIdentity(null);
        expect(typeof id.writerId).toBe('string');
        expect(id.seq).toBe(0);
    });
});
