import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import z from 'zod';
import errorHandler from '@/handlers/errorHandler';
import { validate } from '@/utils/validate';
import { problemBody } from '../support/problem';

let logged: ReturnType<typeof spyOn>;

beforeEach(() => {
    logged = spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    logged.mockRestore();
});

// What Drizzle throws: its own error, with the driver's error as the cause. Its
// message holds the SQL.
const drizzleError = (code: string, table = 'albums', constraint = 'albums_artist_id_fkey') =>
    Object.assign(new Error('Failed query: insert into "albums" ("title") values ($1)'), {
        cause: Object.assign(new Error('insert or update violates a constraint'), { code, table, constraint }),
    });

// Mounted under a parent, as the routes are, to show the parent's handler also
// covers thrown errors in a sub-app.
const appThrowing = (error: unknown) => {
    const child = new Hono().get('/', () => {
        throw error;
    });

    return new Hono().onError(errorHandler).route('/', child);
};

describe('errorHandler', () => {
    it.each([
        ['23505', 409, 'A row with that value already exists.', 'duplicate_value'],
        ['23503', 422, 'The row refers to a parent that does not exist.', 'invalid_reference'],
        ['22001', 422, 'A value is too long for its column.', 'value_too_long'],
    ])('maps Postgres error %s to a %i problem', async (sqlstate, status, detail, code) => {
        const res = await appThrowing(drizzleError(sqlstate)).request('/');

        expect(res.status).toBe(status);
        expect(res.headers.get('Content-Type')).toBe('application/problem+json');
        expect(await res.json()).toEqual(problemBody(status, detail, code));
    });

    it('never returns the SQL or the driver message', async () => {
        const res = await appThrowing(drizzleError('23503')).request('/');
        const text = await res.text();

        expect(text).not.toContain('insert');
        expect(text).not.toContain('albums');
        expect(text).not.toContain('violates');
    });

    it('answers any other error with a generic 500 and logs it', async () => {
        const failure = drizzleError('42P01');

        const res = await appThrowing(failure).request('/');

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual(problemBody(500, 'An unexpected error occurred.'));
        expect(logged).toHaveBeenCalledWith(failure);
    });

    it('does not leak the message of a plain error', async () => {
        const res = await appThrowing(new Error('connect ECONNREFUSED 10.0.0.5:5432')).request('/');

        expect(res.status).toBe(500);
        expect(await res.text()).not.toContain('10.0.0.5');
    });

    it('answers an HTTPException with its own status and message as a problem', async () => {
        const res = await appThrowing(new HTTPException(400, { message: 'Malformed JSON in request body' })).request(
            '/',
        );

        expect(res.status).toBe(400);
        expect(res.headers.get('Content-Type')).toBe('application/problem+json');
        expect(await res.json()).toEqual(problemBody(400, 'Malformed JSON in request body'));
    });

    it('answers malformed JSON, as the validator rejects it, with 400', async () => {
        const app = new Hono()
            .onError(errorHandler)
            .post('/', validate('json', z.object({ name: z.string() })), (c) => c.json({ ok: true }));

        const res = await app.request('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"name": ',
        });

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual(problemBody(400, 'Malformed JSON in request body'));
    });
});
