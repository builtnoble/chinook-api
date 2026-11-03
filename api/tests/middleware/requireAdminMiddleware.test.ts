import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import requireAdminMiddleware from '@/middleware/requireAdminMiddleware';

const appFor = (user: { role?: string | null } | null) => {
    const app = new Hono();

    app.use(async (c, next) => {
        c.set('user' as never, user as never);
        await next();
    });
    app.use(requireAdminMiddleware);
    app.all('/', (c) => c.json({ ok: true }));

    return app;
};

const write = (app: Hono, method: string) => app.request('/', { method });

describe('requireAdminMiddleware', () => {
    it.each(['GET', 'HEAD'])('lets a non-admin %s through', async (method) => {
        const res = await write(appFor({ role: 'user' }), method);

        expect(res.status).toBe(200);
    });

    it.each(['POST', 'PATCH', 'DELETE'])('rejects a non-admin %s with 403', async (method) => {
        const res = await write(appFor({ role: 'user' }), method);

        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'This action requires the admin role.' });
    });

    it('rejects a user with no role, as the default plugin role is not an admin', async () => {
        const res = await write(appFor({ role: null }), 'POST');

        expect(res.status).toBe(403);
    });

    it.each(['POST', 'PATCH', 'DELETE'])('lets an admin %s through', async (method) => {
        const res = await write(appFor({ role: 'admin' }), method);

        expect(res.status).toBe(200);
    });
});
