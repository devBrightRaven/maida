import { describe, it, expect, vi, beforeEach } from 'vitest';
import https from 'node:https';
import {
    fetchIgdbTimeToBeat,
    extractTimeToBeat,
    _resetRateLimit,
} from '../../../electron/services/igdb.cjs';

/**
 * Helper: create a mock https response object.
 */
function createMockRes(statusCode, body) {
    return {
        statusCode,
        on: vi.fn((event, handler) => {
            if (event === 'data') handler(JSON.stringify(body));
            if (event === 'end') handler();
        }),
    };
}

/**
 * Helper: mock https.request to always return the same response.
 */
function mockIgdbResponse(statusCode, body) {
    vi.spyOn(https, 'request').mockImplementation((_opts, callback) => {
        callback(createMockRes(statusCode, body));
        return { on: vi.fn(), write: vi.fn(), end: vi.fn() };
    });
}

/**
 * Helper: mock sequential https.request calls with different responses per call.
 * @param {Array<{statusCode: number, body: any}>} responses
 */
function mockSequentialResponses(responses) {
    let callCount = 0;
    vi.spyOn(https, 'request').mockImplementation((_opts, callback) => {
        const idx = Math.min(callCount, responses.length - 1);
        callCount++;
        callback(createMockRes(responses[idx].statusCode, responses[idx].body));
        return { on: vi.fn(), write: vi.fn(), end: vi.fn() };
    });
}

describe('igdb', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        _resetRateLimit();
    });

    describe('extractTimeToBeat', () => {
        it('extracts all three fields', () => {
            const data = { hastily: 3600, normally: 7200, completely: 14400 };
            expect(extractTimeToBeat(data)).toEqual({
                hastily: 3600,
                normally: 7200,
                completely: 14400,
            });
        });

        it('returns partial data (only normally)', () => {
            const data = { normally: 5000 };
            expect(extractTimeToBeat(data)).toEqual({
                hastily: null,
                normally: 5000,
                completely: null,
            });
        });

        it('returns null when data is missing', () => {
            expect(extractTimeToBeat({})).toBeNull();
            expect(extractTimeToBeat(null)).toBeNull();
            expect(extractTimeToBeat(undefined)).toBeNull();
        });

        it('returns null when all fields are zero or missing', () => {
            const data = { hastily: 0, normally: 0 };
            expect(extractTimeToBeat(data)).toBeNull();
        });
    });

    describe('fetchIgdbTimeToBeat', () => {
        it('returns time_to_beat from Steam appId lookup', async () => {
            // Call 1: external_games → returns game ID
            // Call 2: game_time_to_beats → returns TTB data
            mockSequentialResponses([
                { statusCode: 200, body: [{ game: 12345 }] },
                { statusCode: 200, body: [{ hastily: 1800, normally: 3600, completely: 7200 }] },
            ]);

            const result = await fetchIgdbTimeToBeat('730', 'Counter-Strike', 'token', 'clientId');
            expect(result).toEqual({
                hastily: 1800,
                normally: 3600,
                completely: 7200,
            });
            expect(https.request).toHaveBeenCalledTimes(2);
        });

        it('falls back to title search when appId returns no results', async () => {
            // Call 1: external_games → empty (no match by Steam appId)
            // Call 2: games search → returns game ID
            // Call 3: game_time_to_beats → returns TTB data
            mockSequentialResponses([
                { statusCode: 200, body: [] },
                { statusCode: 200, body: [{ id: 67890 }] },
                { statusCode: 200, body: [{ hastily: 900, normally: 1800, completely: 3600 }] },
            ]);

            const result = await fetchIgdbTimeToBeat('99999', 'Obscure Game', 'token', 'clientId');
            expect(result).toEqual({
                hastily: 900,
                normally: 1800,
                completely: 3600,
            });
            expect(https.request).toHaveBeenCalledTimes(3);
        });

        it('returns null when both lookups fail', async () => {
            // Call 1: external_games → empty
            // Call 2: games search → empty
            mockSequentialResponses([
                { statusCode: 200, body: [] },
                { statusCode: 200, body: [] },
            ]);

            const result = await fetchIgdbTimeToBeat('99999', 'NonExistent', 'token', 'clientId');
            expect(result).toBeNull();
        });

        it('returns null when accessToken is missing', async () => {
            const result = await fetchIgdbTimeToBeat('730', 'CS', null, 'clientId');
            expect(result).toBeNull();
        });

        it('returns null when clientId is missing', async () => {
            const result = await fetchIgdbTimeToBeat('730', 'CS', 'token', null);
            expect(result).toBeNull();
        });

        it('handles API error gracefully', async () => {
            mockIgdbResponse(500, { message: 'Internal Server Error' });

            const result = await fetchIgdbTimeToBeat('730', 'CS', 'token', 'clientId');
            expect(result).toBeNull();
        });

        it('handles network error gracefully', async () => {
            vi.spyOn(https, 'request').mockImplementation((_opts, _callback) => {
                const req = {
                    on: vi.fn((event, handler) => {
                        if (event === 'error') handler(new Error('ECONNREFUSED'));
                    }),
                    write: vi.fn(),
                    end: vi.fn(),
                };
                return req;
            });

            const result = await fetchIgdbTimeToBeat('730', 'CS', 'token', 'clientId');
            expect(result).toBeNull();
        });

        it('escapes quotes in title for fallback search', async () => {
            let capturedBodies = [];
            let callCount = 0;
            vi.spyOn(https, 'request').mockImplementation((_opts, callback) => {
                callCount++;
                callback(createMockRes(200, []));
                return {
                    on: vi.fn(),
                    write: vi.fn((body) => {
                        capturedBodies.push(body);
                    }),
                    end: vi.fn(),
                };
            });

            await fetchIgdbTimeToBeat('1', 'Game "Special" Edition', 'token', 'clientId');
            // Call 1: external_games (empty) → Call 2: games search with escaped quotes
            expect(capturedBodies.length).toBeGreaterThanOrEqual(2);
            expect(capturedBodies[1]).toContain('Game \\"Special\\" Edition');
        });

        it('skips appId lookup when steamAppId is falsy', async () => {
            // Call 1: games search → returns game ID
            // Call 2: game_time_to_beats → returns TTB data
            mockSequentialResponses([
                { statusCode: 200, body: [{ id: 11111 }] },
                { statusCode: 200, body: [{ normally: 5000 }] },
            ]);

            const result = await fetchIgdbTimeToBeat(null, 'Some Game', 'token', 'clientId');
            expect(result).toEqual({ hastily: null, normally: 5000, completely: null });
            // Should have made 2 calls: games search + game_time_to_beats (no external_games)
            expect(https.request).toHaveBeenCalledTimes(2);
        });
    });
});
