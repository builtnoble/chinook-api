import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { PROBLEM_CONTENT_TYPE, ProblemError, problem, statusTitle } from '@/lib/problem-details';

describe('problem', () => {
    it('describes a status and a message as a problem document', () => {
        expect(problem(404, 'Artist not found.').toProblemDetails()).toEqual({
            type: 'about:blank',
            title: 'Not Found',
            status: 404,
            detail: 'Artist not found.',
            code: 'not_found',
        });
    });

    it('leaves out detail when there is no message', () => {
        expect(problem(401).toProblemDetails()).not.toHaveProperty('detail');
    });

    it('takes a code, title, type, instance and the field errors that are given', () => {
        const errors = [{ field: '/name', in: 'body' as const, message: 'Required' }];

        expect(
            problem(400, 'Nope.', {
                code: 'validation_failed',
                title: 'Invalid',
                type: 'https://example.test/problems/invalid',
                instance: '/requests/7',
                errors,
            }).toProblemDetails(),
        ).toEqual({
            type: 'https://example.test/problems/invalid',
            title: 'Invalid',
            status: 400,
            detail: 'Nope.',
            instance: '/requests/7',
            code: 'validation_failed',
            errors,
        });
    });

    it('lists the standard members first, then the extensions', () => {
        const document = problem(409, 'Taken.', { extensions: { retry_in: 5 } }).toProblemDetails();

        expect(Object.keys(document)).toEqual(['type', 'title', 'status', 'detail', 'code', 'retry_in']);
    });

    it('never lets an extension replace a standard member', () => {
        const document = problem(409, 'Taken.', {
            extensions: { status: 200, title: 'Fine', type: 'x', detail: 'y', code: 'z', retry_in: 5 },
        }).toProblemDetails();

        expect(document).toMatchObject({
            status: 409,
            title: 'Conflict',
            type: 'about:blank',
            detail: 'Taken.',
            code: 'conflict',
        });
        expect(document.retry_in).toBe(5);
    });

    it('derives the code from the title, so it is snake_case', () => {
        expect(problem(422).toProblemDetails().code).toBe('unprocessable_content');
        expect(problem(500).toProblemDetails().code).toBe('internal_server_error');
        expect(problem(400, undefined, { title: 'Out of Stock!' }).toProblemDetails().code).toBe('out_of_stock');
    });

    it('gives a generic title to a status it has no reason phrase for', () => {
        expect(statusTitle(404)).toBe('Not Found');
        expect(statusTitle(499)).toBe('Client Error');
        expect(statusTitle(599)).toBe('Server Error');
    });

    it.each([200, 301, 399])('refuses the status %i, which is not an error', (status) => {
        expect(() => problem(status as 200)).toThrow(RangeError);
    });
});

describe('ProblemError', () => {
    it('is an HTTPException, so code that handles those handles it', () => {
        const error = problem(403, 'No.');

        expect(error).toBeInstanceOf(ProblemError);
        expect(error).toBeInstanceOf(HTTPException);
        expect(error).toBeInstanceOf(Error);
        expect(error.status).toBe(403);
        expect(error.message).toBe('No.');
    });

    it('keeps the cause for logging and does not put it in the document', () => {
        const cause = new Error('connect ECONNREFUSED 10.0.0.5:5432');
        const error = problem(500, 'Failed.', { cause });

        expect(error.cause).toBe(cause);
        expect(JSON.stringify(error.toProblemDetails())).not.toContain('ECONNREFUSED');
    });

    it('answers with a problem response, with the headers it was given', async () => {
        const res = problem(401, 'Sign in.', { headers: { 'WWW-Authenticate': 'Bearer' } }).getResponse();

        expect(res.status).toBe(401);
        expect(res.headers.get('Content-Type')).toBe(PROBLEM_CONTENT_TYPE);
        expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
        expect(await res.json()).toEqual({
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            detail: 'Sign in.',
            code: 'unauthorized',
        });
    });

    it('does not let the headers it was given change the content type', () => {
        const res = problem(400, undefined, { headers: { 'Content-Type': 'text/plain' } }).getResponse();

        expect(res.headers.get('Content-Type')).toBe(PROBLEM_CONTENT_TYPE);
    });

    it('is answered as a problem by Hono itself, with no handler from this library installed', async () => {
        const app = new Hono().get('/', () => {
            throw problem(404, 'Artist not found.');
        });

        const res = await app.request('/');

        expect(res.status).toBe(404);
        expect(res.headers.get('Content-Type')).toBe(PROBLEM_CONTENT_TYPE);
        expect(await res.json()).toMatchObject({ status: 404, detail: 'Artist not found.' });
    });
});
