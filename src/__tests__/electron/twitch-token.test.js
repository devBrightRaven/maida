import { describe, it, expect, vi, beforeEach } from 'vitest';
import https from 'node:https';
import {
    getAccessToken,
    refreshIfExpired,
    clearTokenCache,
    _getTokenCache,
} from '../../../electron/auth/twitch-token.cjs';

/**
 * Helper: simulate an https.request call that resolves with given statusCode + body.
 */
function mockHttpResponse(statusCode, body) {
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

describe('twitch-token', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        clearTokenCache();
    });

    describe('getAccessToken', () => {
        it('returns token on successful response', async () => {
            mockHttpResponse(200, {
                access_token: 'abc123',
                expires_in: 5000000,
                token_type: 'bearer',
            });

            const result = await getAccessToken('myId', 'mySecret');
            expect(result).toEqual({ accessToken: 'abc123', expiresIn: 5000000 });
        });

        it('returns null on non-200 status', async () => {
            mockHttpResponse(401, { message: 'invalid client' });

            const result = await getAccessToken('bad', 'creds');
            expect(result).toBeNull();
        });

        it('returns null when access_token is missing from response', async () => {
            mockHttpResponse(200, { token_type: 'bearer' });

            const result = await getAccessToken('id', 'secret');
            expect(result).toBeNull();
        });

        it('returns null when clientId is empty', async () => {
            const result = await getAccessToken('', 'secret');
            expect(result).toBeNull();
        });

        it('returns null when clientSecret is empty', async () => {
            const result = await getAccessToken('id', '');
            expect(result).toBeNull();
        });

        it('returns null on network error', async () => {
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

            const result = await getAccessToken('id', 'secret');
            expect(result).toBeNull();
        });

        it('returns null on malformed JSON response', async () => {
            vi.spyOn(https, 'request').mockImplementation((_opts, callback) => {
                const res = {
                    statusCode: 200,
                    on: vi.fn((event, handler) => {
                        if (event === 'data') handler('not json');
                        if (event === 'end') handler();
                    }),
                };
                callback(res);
                return { on: vi.fn(), write: vi.fn(), end: vi.fn() };
            });

            const result = await getAccessToken('id', 'secret');
            expect(result).toBeNull();
        });
    });

    describe('refreshIfExpired', () => {
        it('returns cached token if not expired', async () => {
            // First call: fetch token
            mockHttpResponse(200, { access_token: 'tok1', expires_in: 3600 });
            const first = await refreshIfExpired('id', 'secret');
            expect(first).toBe('tok1');

            // Second call: should use cache (no new HTTP call)
            vi.mocked(https.request).mockClear();
            const second = await refreshIfExpired('id', 'secret');
            expect(second).toBe('tok1');
            expect(https.request).not.toHaveBeenCalled();
        });

        it('fetches new token when cache is empty', async () => {
            mockHttpResponse(200, { access_token: 'fresh', expires_in: 3600 });

            const result = await refreshIfExpired('id', 'secret');
            expect(result).toBe('fresh');
            expect(https.request).toHaveBeenCalled();
        });

        it('returns null when OAuth fails', async () => {
            mockHttpResponse(500, { error: 'server error' });

            const result = await refreshIfExpired('id', 'secret');
            expect(result).toBeNull();
        });

        it('clears cache when OAuth fails', async () => {
            // First: get valid token
            mockHttpResponse(200, { access_token: 'valid', expires_in: 1 });
            await refreshIfExpired('id', 'secret');

            // Simulate expiry by clearing cache
            clearTokenCache();

            // Second: fail
            mockHttpResponse(500, {});
            await refreshIfExpired('id', 'secret');

            const cache = _getTokenCache();
            expect(cache.accessToken).toBeNull();
            expect(cache.expiresAt).toBe(0);
        });
    });

    describe('clearTokenCache', () => {
        it('resets cache to empty state', async () => {
            mockHttpResponse(200, { access_token: 'x', expires_in: 9999 });
            await refreshIfExpired('id', 'secret');

            clearTokenCache();

            const cache = _getTokenCache();
            expect(cache.accessToken).toBeNull();
            expect(cache.expiresAt).toBe(0);
        });
    });
});
