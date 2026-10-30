import { describe, expect, it } from 'bun:test';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { validator } from 'hono-openapi';
import z from 'zod';
import { PROBLEM_CONTENT_TYPE, type ProblemError, problemDetailsHandler, validationHook } from '@/lib/problem-details';

const body = z
    .object({
        name: z.string().min(1),
        track: z.object({ id: z.number().int() }),
        tags: z.array(z.string()).optional(),
    })
    .strict();

// The same route on each validator the hook is meant to work with.
const validators = {
    'hono-openapi': validator,
    '@hono/standard-validator': sValidator,
} as const;

const appWith = (
    validate: (typeof validators)[keyof typeof validators],
    options?: Parameters<typeof validationHook>[0],
) =>
    new Hono()
        .onError(problemDetailsHandler())
        .post('/', validate('json', body, validationHook(options) as never), (c) => c.json({ ok: true }))
        .get(
            '/q/:id',
            validate('param', z.object({ id: z.coerce.number() }), validationHook() as never),
            validate('query', z.object({ page: z.coerce.number().optional() }).strict(), validationHook() as never),
            (c) => c.json({ ok: true }),
        );

const post = (app: Hono, value: unknown) =>
    app.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

describe.each(Object.entries(validators))('validationHook with %s', (_, validate) => {
    const app = appWith(validate);

    it('lets a valid request through', async () => {
        const res = await post(app, { name: 'x', track: { id: 1 } });

        expect(res.status).toBe(200);
    });

    it('fails an invalid body with a 400 problem that lists every issue', async () => {
        const res = await post(app, { track: { id: 'one' }, extra: 1 });
        const document = await res.json();

        expect(res.status).toBe(400);
        expect(res.headers.get('Content-Type')).toBe(PROBLEM_CONTENT_TYPE);
        expect(document).toMatchObject({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'The request is not valid.',
            code: 'validation_failed',
        });
        expect(document.errors).toHaveLength(3);
    });

    it('points at each value with a JSON Pointer, and says the part of the request it is in', async () => {
        const { errors } = await (await post(app, { track: { id: 'one' }, tags: ['a', 7] })).json();

        expect(errors).toContainEqual(expect.objectContaining({ field: '/name', in: 'body', code: 'invalid_type' }));
        expect(errors).toContainEqual(expect.objectContaining({ field: '/track/id', in: 'body' }));
        expect(errors).toContainEqual(expect.objectContaining({ field: '/tags/1', in: 'body' }));
    });

    it('names an unknown key instead of reporting an empty field', async () => {
        const { errors } = await (await post(app, { name: 'x', track: { id: 1 }, colour: 'red' })).json();

        expect(errors).toEqual([
            { field: '/colour', in: 'body', message: expect.stringContaining('colour'), code: 'unrecognized_keys' },
        ]);
    });

    it('names each of several unknown keys', async () => {
        const { errors } = await (await post(app, { name: 'x', track: { id: 1 }, a: 1, b: 2 })).json();

        expect(errors.map((error: { field: string }) => error.field)).toEqual(['/a', '/b']);
    });

    it('says an invalid path parameter is in the path, and a query parameter in the query', async () => {
        const path = await (await app.request('/q/abc')).json();
        const query = await (await app.request('/q/1?colour=red')).json();

        expect(path.errors).toEqual([expect.objectContaining({ field: '/id', in: 'path' })]);
        expect(query.errors).toEqual([expect.objectContaining({ field: '/colour', in: 'query' })]);
    });

    it('treats a body that is not JSON at all as a 400 problem, too', async () => {
        const res = await app.request('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"name":',
        });

        expect(res.status).toBe(400);
        expect(res.headers.get('Content-Type')).toBe(PROBLEM_CONTENT_TYPE);
    });
});

describe('options', () => {
    it('takes another status and detail', async () => {
        const app = appWith(validator, { status: 422, detail: 'Fix the fields.' });

        const res = await post(app, {});

        expect(res.status).toBe(422);
        expect(await res.json()).toMatchObject({
            title: 'Unprocessable Content',
            detail: 'Fix the fields.',
            code: 'validation_failed',
        });
    });
});

describe('the hook on its own', () => {
    const hook = validationHook();

    const failure = (error: unknown): ProblemError => {
        try {
            hook({ success: false, error: [{ message: 'm', ...(error as object) }] } as never);
        } catch (thrown) {
            return thrown as ProblemError;
        }

        throw new Error('The hook did not throw.');
    };

    it('does nothing for a success', () => {
        expect(hook({ success: true })).toBeUndefined();
    });

    it('reads path segments given as { key } objects, as Standard Schema allows', () => {
        expect(failure({ path: [{ key: 'a' }, 1] }).options.errors).toEqual([{ field: '/a/1', message: 'm' }]);
    });

    it('uses the empty pointer for an issue about the whole value', () => {
        expect(failure({}).options.errors).toEqual([{ field: '', message: 'm' }]);
    });

    it('escapes ~ and / in a key, as RFC 6901 says', () => {
        expect(failure({ path: ['a/b', 'c~d'] }).options.errors?.[0]?.field).toBe('/a~1b/c~0d');
    });

    it('leaves out the part of the request when the validator does not say', () => {
        expect(failure({}).options.errors?.[0]).not.toHaveProperty('in');
    });
});
