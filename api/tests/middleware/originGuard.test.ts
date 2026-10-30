import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import originGuard from '@/middleware/originGuard';

const originalOrigins = process.env.CORS_ORIGINS;
const originalBaseUrl = process.env.BETTER_AUTH_URL;

const restore = (key: string, value: string | undefined) => {
    if (value === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = value;
    }
};

beforeEach(() => {
    process.env.CORS_ORIGINS = 'http://localhost:5173';
    process.env.BETTER_AUTH_URL = 'http://api.chinook.localhost';
});

afterEach(() => {
    restore('CORS_ORIGINS', originalOrigins);
    restore('BETTER_AUTH_URL', originalBaseUrl);
});

const app = new Hono().use(originGuard).all('/', (c) => c.json({ ok: true }));

const send = (method: string, headers: Record<string, string> = {}) => app.request('/', { method, headers });

const cookie = { Cookie: 'better-auth.session_token=abc' };

describe('originGuard', () => {
    it.each(['POST', 'PATCH', 'DELETE'])('rejects a cookie %s from an origin that is not listed', async (method) => {
        const res = await send(method, { ...cookie, Origin: 'http://evil.test' });

        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'The request comes from an origin that is not allowed.' });
    });

    it('rejects a cookie write that has no Origin header', async () => {
        const res = await send('POST', cookie);

        expect(res.status).toBe(403);
    });

    it.each(['POST', 'PATCH', 'DELETE'])('lets a cookie %s from a listed origin through', async (method) => {
        const res = await send(method, { ...cookie, Origin: 'http://localhost:5173' });

        expect(res.status).toBe(200);
    });

    it('lets a cookie write from the API base URL through, as Insomnia sends it', async () => {
        const res = await send('POST', { ...cookie, Origin: 'http://api.chinook.localhost' });

        expect(res.status).toBe(200);
    });

    it('trusts only the base URL when CORS_ORIGINS is unset', async () => {
        delete process.env.CORS_ORIGINS;

        expect((await send('POST', { ...cookie, Origin: 'http://localhost:5173' })).status).toBe(403);
        expect((await send('POST', { ...cookie, Origin: 'http://api.chinook.localhost' })).status).toBe(200);
    });

    it('does not guard a bearer request, even with a cookie and an unlisted origin', async () => {
        const res = await send('POST', { ...cookie, Authorization: 'Bearer token', Origin: 'http://evil.test' });

        expect(res.status).toBe(200);
    });

    it('does not guard a request with no cookie', async () => {
        const res = await send('POST', { Origin: 'http://evil.test' });

        expect(res.status).toBe(200);
    });

    it.each(['GET', 'HEAD', 'OPTIONS'])('does not guard %s', async (method) => {
        const res = await send(method, { ...cookie, Origin: 'http://evil.test' });

        expect(res.status).toBe(200);
    });
});
