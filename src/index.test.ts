/// <reference types="bun" />
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// Serve the app the way production does (`fetch: app.fetch` under Bun), where Hono's `c.env`
// is the server object and not the process environment.
let server: ReturnType<typeof Bun.serve>;
const originalOrigins = process.env.CORS_ORIGINS;
const originalNodeEnv = process.env.NODE_ENV;

beforeAll(async () => {
    // `bun test` sets NODE_ENV=test, and Better Auth skips its origin check in that mode. Import the app
    // under another value so the tests exercise the check that runs in development and production.
    process.env.NODE_ENV = 'development';
    const { default: app } = await import('./index');

    server = Bun.serve({ port: 0, fetch: app.fetch });
});

afterAll(() => {
    server.stop(true);

    for (const [key, value] of [
        ['CORS_ORIGINS', originalOrigins],
        ['NODE_ENV', originalNodeEnv],
    ] as const) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
});

const request = (origin: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
    fetch(`http://localhost:${server.port}/health`, {
        method: init.method,
        headers: { Origin: origin, ...init.headers },
    });

// A cookie header makes Better Auth enforce its origin check, as it does for a browser frontend.
// The credentials are wrong on purpose: only the origin check is observed, and nothing is created.
const signIn = (origin: string) =>
    fetch(`http://localhost:${server.port}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: 'probe=1' },
        body: JSON.stringify({ email: 'nobody@example.test', password: 'wrong-password' }),
    });

describe('Better Auth trusted origins', () => {
    it('trusts an origin listed in CORS_ORIGINS', async () => {
        process.env.CORS_ORIGINS = 'http://localhost:8000';

        const res = await signIn('http://localhost:8000');

        expect(await res.text()).not.toContain('INVALID_ORIGIN');
    });

    it('rejects an origin that is not listed', async () => {
        process.env.CORS_ORIGINS = 'http://localhost:8000';

        const res = await signIn('http://evil.test');

        expect(res.status).toBe(403);
        expect(await res.text()).toContain('INVALID_ORIGIN');
    });

    it('still trusts its own base URL when CORS_ORIGINS is unset', async () => {
        delete process.env.CORS_ORIGINS;

        const res = await signIn(process.env.BETTER_AUTH_URL || 'http://localhost:3000');

        expect(await res.text()).not.toContain('INVALID_ORIGIN');
    });
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
