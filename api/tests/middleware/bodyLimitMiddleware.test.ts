import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import z from 'zod';
import errorHandler from '@/handlers/errorHandler';
import bodyLimitMiddleware, { maxBodyBytes } from '@/middleware/bodyLimitMiddleware';
import { validate } from '@/utils/validate';
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

    // The JSON validator catches the failure of a body that is too large while
    // it reads, and answers 400 for malformed JSON in its place.
    it('answers 413, and not 400, when a validator reads an oversized body that does not declare its length', async () => {
        const app = new Hono()
            .onError(errorHandler)
            .use(bodyLimitMiddleware)
            .post('/', validate('json', z.object({ name: z.string() })), (c) => c.json({ ok: true }));
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(JSON.stringify({ name: 'x'.repeat(maxBodyBytes) })));
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
        expect(await res.json()).toEqual(problemBody(413, 'The request body is too large.'));
    });
});
