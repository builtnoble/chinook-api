import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import bodyLimitMiddleware, { maxBodyBytes } from '@/middleware/bodyLimitMiddleware';
import { problemBody } from '../support/problem';

const app = new Hono().use(bodyLimitMiddleware).post('/', async (c) => c.json({ length: (await c.req.text()).length }));

const post = (body: string, headers: Record<string, string> = {}) =>
    app.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });

describe('bodyLimitMiddleware', () => {
    it('accepts a body at the limit', async () => {
        const res = await post('x'.repeat(maxBodyBytes));

        expect(res.status).toBe(200);
    });

    it('rejects a body over the limit with 413 and an error', async () => {
        const res = await post('x'.repeat(maxBodyBytes + 1));

        expect(res.status).toBe(413);
        expect(await res.json()).toEqual(problemBody(413, 'The request body is too large.'));
    });

    it('rejects an oversized body that does not declare its length', async () => {
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('x'.repeat(maxBodyBytes + 1)));
                controller.close();
            },
        });

        const res = await app.request('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: stream,
            duplex: 'half',
        } as RequestInit);

        expect(res.status).toBe(413);
    });

    it('does not touch a request with no body', async () => {
        const res = await app.request('/', { method: 'POST' });

        expect(res.status).toBe(200);
    });
});
