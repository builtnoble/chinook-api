import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import z from 'zod';
import errorHandler from '@/handlers/errorHandler';
import { validate } from '@/utils/requestValidationHelper';

const app = new Hono()
    .onError(errorHandler)
    .post(
        '/artists/:id',
        validate('param', z.object({ id: z.coerce.number() })),
        validate('json', z.object({ name: z.string() }).strict()),
        (c) => c.json({ data: c.req.valid('json') }),
    );

const send = (path: string, body: unknown) =>
    app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('validate', () => {
    it('passes a valid request to the handler, typed and parsed', async () => {
        const res = await send('/artists/7', { name: 'AC/DC' });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: { name: 'AC/DC' } });
    });

    it('answers an invalid body with a 400 problem that lists every issue', async () => {
        const res = await send('/artists/7', { name: 42, colour: 'red' });

        expect(res.status).toBe(400);
        expect(res.headers.get('Content-Type')).toBe('application/problem+json');
        expect(await res.json()).toEqual({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'The request is not valid.',
            code: 'validation_failed',
            errors: [
                {
                    field: '/name',
                    in: 'body',
                    message: 'Invalid input: expected string, received number',
                    code: 'invalid_type',
                },
                { field: '/colour', in: 'body', message: 'Unrecognized key: "colour"', code: 'unrecognized_keys' },
            ],
        });
    });

    it('says which part of the request an issue is in', async () => {
        const res = await send('/artists/abc', { name: 'AC/DC' });
        const body = (await res.json()) as { errors: { field: string; in: string }[] };

        expect(res.status).toBe(400);
        expect(body.errors).toEqual([expect.objectContaining({ field: '/id', in: 'path' })]);
    });
});
