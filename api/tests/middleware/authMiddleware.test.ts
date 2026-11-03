import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { auth } from '@/auth';
import errorHandler from '@/handlers/errorHandler';
import authMiddleware from '@/middleware/authMiddleware';
import { problemBody } from '../support/problem';

const spies: { mockRestore: () => void }[] = [];

afterEach(() => {
    for (const spy of spies.splice(0)) {
        spy.mockRestore();
    }
});

const signedInAs = (session: object | null) => {
    spies.push(spyOn(auth.api, 'getSession').mockResolvedValue(session as never));
};

const app = new Hono()
    .onError(errorHandler)
    .use(authMiddleware)
    .get('/', (c) => c.json({ ok: true }));

describe('authMiddleware', () => {
    it('passes a request with a session to the handler', async () => {
        signedInAs({ user: { id: 'u1' }, session: { id: 's1' } });

        const res = await app.request('/');

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
    });

    it('answers a request with no credentials with 401, naming the Bearer scheme', async () => {
        signedInAs(null);

        const res = await app.request('/');

        expect(res.status).toBe(401);
        expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
        expect(await res.json()).toEqual(problemBody(401, 'Missing or invalid credentials.'));
    });

    it('also says the token was invalid when a bearer token was sent and failed', async () => {
        signedInAs(null);

        const res = await app.request('/', { headers: { Authorization: 'Bearer not-a-real-token' } });

        expect(res.status).toBe(401);
        expect(res.headers.get('WWW-Authenticate')).toBe('Bearer error="invalid_token"');
    });

    it('names only the scheme for a request that sent another kind of credentials', async () => {
        signedInAs(null);

        const res = await app.request('/', { headers: { Authorization: 'Basic dXNlcjpwYXNz' } });

        expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    });
});
