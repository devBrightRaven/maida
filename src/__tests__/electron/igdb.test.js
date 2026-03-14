import { describe, it, expect, vi, beforeEach } from 'vitest';
import https from 'node:https';
import {
    fetchIgdbTimeToBeat,
    extractTimeToBeat,
    _resetRateLimit,
} from '../../../electron/services/igdb.cjs';

/**
 * Helper: simulate an https POST that resolves with given statusCode + body.
 */
function mockIgdbResponse(statusCode, body) {
    vi.spyOn(https, 'request').mockImplementation((_opts, callback) => {
        const res = {
            statusCode,
            on: vi.fn((event, handler) => {
                if (event === 'data') handler(JSON.stringify(body));
                if (event === 'end') handler();
            }),
        };
        callback(res);
        return {
            on: vi.fn(),
            write: vi.fn(),
            end: vi.fn(),
        };
    });
}

describe('igdb', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        _resetRateLimit();
    });

    describe('extractTimeToBeat', () => {
        it('extracts all three fields', () => {
            const game = {
                time_to_beat: { hastily: 3600, normally: 7200, completely: 14400 },
            };
            expect(extractTimeToBeat(game)).toEqual({
                hastily: 3600,
                normally: 7200,
                completely: 14400,
            });
        });

        it('returns partial data (only normally)', () => {
            const game = { time_to_beat: { normally: 5000 } };
            expect(extractTimeToBeat(game)).toEqual({
                hastily: null,
                normally: 5000,
                completely: null,
            });
        });

        it('returns null when time_to_beat is missing', () => {
            expect(extractTimeToBeat({})).toBeNull();
            expect(extractTimeToBeat(null)).toBeNull();
            expect(extractTimeToBeat(undefined)).toBeNull();
        });

        it('returns null when all fields are zero or missing', () => {
            const game = { time_to_beat: { hastily: 0, normally: 0 } };
            expect(extractTimeToBeat(game)).toBeNull();
        });
    });

    describe('fetchIgdbTimeToBeat', () => {
        it('returns time_to_beat from Steam appId lookup', async () => {
            mockIgdbResponse(200, [
                {
                    game: {
                        time_to_beat: {
                            hastily: 1800,
                            normally: 3600,
                            completely: 7200,
                        },
                    },
                },
            ]);

            const result = await fetchIgdbTimeToBeat('730', 'Counter-Strike', 'token', 'clientId');
            expect(result).toEqual({
                hastily: 1800,
                normally: 3600,
                completely: 7200,
            });
        });

        it('falls back to title search when appId returns no results', async () => {
            let callCount = 0;
            vi.spyOn(https, 'request').mockImplementation((opts, callback) => {
                callCount++;
                let body;
                if (callCount === 1) {
                    // First call: external_games — empty results
                    body = [];
                } else {
                    // Second call: games search — has results
                    body = [
                        {
                            time_to_beat: {
                                hastily: 900,
                                normally: 1800,
                                completely: 3600,
                            },
                        },
                    ];
                }
                const res = {
                    statusCode: 200,
                    on: vi.fn((event, handler) => {
                        if (event === 'data') handler(JSON.stringify(body));
                        if (event === 'end') handler();
                    }),
                };
                callback(res);
                return { on: vi.fn(), write: vi.fn(), end: vi.fn() };
            });

            const result = await fetchIgdbTimeToBeat('99999', 'Obscure Game', 'token', 'clientId');
            expect(result).toEqual({
                hastily: 900,
                normally: 1800,
                completely: 3600,
            });
            expect(callCount).toBe(2);
        });

        it('returns null when both lookups fail', async () => {
            mockIgdbResponse(200, []);

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
            let capturedBody = '';
            let callCount = 0;
            vi.spyOn(https, 'request').mockImplementation((opts, callback) => {
                callCount++;
                const res = {
                    statusCode: 200,
                    on: vi.fn((event, handler) => {
                        if (event === 'data') handler('[]');
                        if (event === 'end') handler();
                    }),
                };
                callback(res);
                return {
                    on: vi.fn(),
                    write: vi.fn((body) => {
                        if (callCount === 2) capturedBody = body;
                    }),
                    end: vi.fn(),
                };
            });

            await fetchIgdbTimeToBeat('1', 'Game "Special" Edition', 'token', 'clientId');
            expect(capturedBody).toContain('Game \\"Special\\" Edition');
        });

        it('skips appId lookup when steamAppId is falsy', async () => {
            mockIgdbResponse(200, [
                { time_to_beat: { normally: 5000 } },
            ]);

            const result = await fetchIgdbTimeToBeat(null, 'Some Game', 'token', 'clientId');
            expect(result).toEqual({ hastily: null, normally: 5000, completely: null });
            // Should only have made 1 call (title search), not 2
            expect(https.request).toHaveBeenCalledTimes(1);
        });
    });
});
