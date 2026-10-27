/// <reference types="bun" />
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import app from './index';

// Serve the app the way production does (`fetch: app.fetch` under Bun), where Hono's `c.env`
// is the server object and not the process environment.
let server: ReturnType<typeof Bun.serve>;
const originalOrigins = process.env.CORS_ORIGINS;

beforeAll(() => {
    server = Bun.serve({ port: 0, fetch: app.fetch });
});

afterAll(() => {
    server.stop(true);

    if (originalOrigins === undefined) {
        delete process.env.CORS_ORIGINS;
    } else {
        process.env.CORS_ORIGINS = originalOrigins;
    }
});

const request = (origin: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
    fetch(`http://localhost:${server.port}/health`, {
        method: init.method,
        headers: { Origin: origin, ...init.headers },
    });

describe('CORS_ORIGINS', () => {
    it('allows an origin listed in CORS_ORIGINS', async () => {
        process.env.CORS_ORIGINS = 'http://localhost:5173';

        const res = await request('http://localhost:5173');

        expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    });

    it('accepts a comma-separated list and ignores surrounding spaces', async () => {
        process.env.CORS_ORIGINS = ' http://a.test , http://b.test ';

        const res = await request('http://b.test');

        expect(res.headers.get('access-control-allow-origin')).toBe('http://b.test');
    });

    it('does not allow an origin that is not listed', async () => {
        process.env.CORS_ORIGINS = 'http://a.test';

        const res = await request('http://evil.test');

        expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('allows no origin when CORS_ORIGINS is unset', async () => {
        delete process.env.CORS_ORIGINS;

        const res = await request('http://localhost:5173');

        expect(res.status).toBe(200);
        expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('answers a preflight request for a listed origin', async () => {
        process.env.CORS_ORIGINS = 'http://localhost:5173';

        const res = await request('http://localhost:5173', {
            method: 'OPTIONS',
            headers: { 'Access-Control-Request-Method': 'GET' },
        });

        expect(res.status).toBe(204);
        expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
        expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    });
});
