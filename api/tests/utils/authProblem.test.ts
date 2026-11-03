import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import errorHandler from '@/handlers/errorHandler';
import { problemFromAuthResponse } from '@/utils/authProblem';
import { problemBody } from '../support/problem';

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init.headers },
    });

// What Better Auth attaches to some failures: the failing SQL, with its values.
const leaky = {
    code: 'FAILED_TO_CREATE_USER',
    message: 'Failed to create user',
    details: { query: 'insert into "users" (...) values ($1, default)', params: ['a@example.test'], cause: {} },
};

describe('problemFromAuthResponse', () => {
    it('leaves a response that is not a failure untouched', async () => {
        const original = jsonResponse({ ok: true, details: 'kept' }, { status: 200 });

        const res = await problemFromAuthResponse(original);

        expect(res).toBe(original);
        expect(await res.json()).toEqual({ ok: true, details: 'kept' });
    });

    it('answers a failure as a problem, with the message as the detail and the code in lower case', async () => {
        const res = await problemFromAuthResponse(
            jsonResponse({ message: 'Invalid email or password', code: 'INVALID_EMAIL_OR_PASSWORD' }, { status: 401 }),
        );

        expect(res.status).toBe(401);
        expect(res.headers.get('Content-Type')).toBe('application/problem+json');
        expect(await res.json()).toEqual(problemBody(401, 'Invalid email or password', 'invalid_email_or_password'));
    });

    it('calls a failed validation validation_failed, as the rest of the API does', async () => {
        const res = await problemFromAuthResponse(
            jsonResponse(
                {
                    message: '[body.password] Invalid input: expected string, received undefined',
                    code: 'VALIDATION_ERROR',
                },
                { status: 400 },
            ),
        );

        expect(await res.json()).toEqual(
            problemBody(400, '[body.password] Invalid input: expected string, received undefined', 'validation_failed'),
        );
    });

    it('copies only the message and the code, never the details', async () => {
        const res = await problemFromAuthResponse(jsonResponse(leaky, { status: 422 }));
        const text = await res.text();

        expect(JSON.parse(text)).toEqual(problemBody(422, 'Failed to create user', 'failed_to_create_user'));
        expect(text).not.toContain('insert');
        expect(text).not.toContain('a@example.test');
    });

    it('keeps the other headers, including every Set-Cookie', async () => {
        const headers = new Headers({ 'Content-Type': 'application/json', 'X-Retry-After': '30' });
        headers.append('Set-Cookie', 'a=1; Path=/');
        headers.append('Set-Cookie', 'b=2; Path=/');

        const res = await problemFromAuthResponse(
            new Response(JSON.stringify({ message: 'Too many requests.' }), { status: 429, headers }),
        );

        expect(res.headers.get('X-Retry-After')).toBe('30');
        expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
        expect(await res.json()).toEqual(problemBody(429, 'Too many requests.'));
    });

    it('serves a body that matches its Content-Length', async () => {
        const res = await problemFromAuthResponse(
            jsonResponse(leaky, { status: 422, headers: { 'Content-Length': '1030' } }),
        );

        const text = await res.text();
        const length = res.headers.get('Content-Length');

        expect(length === null || Number(length) === new TextEncoder().encode(text).length).toBe(true);
    });

    it.each([
        ['no body', new Response(null, { status: 404 })],
        [
            'a body that is not JSON',
            new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } }),
        ],
        ['malformed JSON', new Response('{not json', { status: 404, headers: { 'Content-Type': 'application/json' } })],
        ['JSON that is not an object', jsonResponse(['nope'], { status: 404 })],
        ['a message that is not text', jsonResponse({ message: { nested: true }, code: 7 }, { status: 404 })],
    ])('answers %s with the status alone', async (_, response) => {
        const res = await problemFromAuthResponse(response);

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ type: 'about:blank', title: 'Not Found', status: 404, code: 'not_found' });
    });
});

describe('problemFromAuthResponse for a server error', () => {
    let logged: ReturnType<typeof spyOn>;

    beforeEach(() => {
        logged = spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        logged.mockRestore();
    });

    const failure = () => jsonResponse(leaky, { status: 503, headers: { 'Retry-After': '10' } });

    it('throws an HTTPException with the response, so the error handler answers it', async () => {
        const error = await problemFromAuthResponse(failure()).catch((caught) => caught);

        expect(error).toBeInstanceOf(HTTPException);
        expect(error.status).toBe(503);
    });

    it('is answered with a generic detail that hides the cause, keeping the headers, and is logged', async () => {
        const app = new Hono().onError(errorHandler).get('/', async () => problemFromAuthResponse(failure()));

        const res = await app.request('/');
        const text = await res.text();

        expect(res.status).toBe(503);
        expect(res.headers.get('Retry-After')).toBe('10');
        expect(JSON.parse(text)).toEqual(problemBody(503, 'An unexpected error occurred.', 'service_unavailable'));
        expect(text).not.toContain('insert');
        expect(logged).toHaveBeenCalled();
    });
});
