import { describe, expect, it, mock } from 'bun:test';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import {
    PROBLEM_CONTENT_TYPE,
    type ProblemDetailsOptions,
    problem,
    problemDetailsHandler,
    problemNotFound,
} from '@/lib/problem-details';

// An app whose `/` route throws what the test gives it.
const appThrowing = (error: unknown, options?: ProblemDetailsOptions) =>
    new Hono().onError(problemDetailsHandler(options)).get('/', () => {
        throw error;
    });

const read = async (res: Response) => ({
    status: res.status,
    type: res.headers.get('Content-Type'),
    body: await res.json(),
});

describe('problemDetailsHandler', () => {
    it('answers a ProblemError as it describes itself', async () => {
        const res = await appThrowing(problem(409, 'Taken.', { code: 'name_taken' })).request('/');

        expect(await read(res)).toEqual({
            status: 409,
            type: PROBLEM_CONTENT_TYPE,
            body: { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Taken.', code: 'name_taken' },
        });
    });

    describe('an HTTPException', () => {
        it('keeps its status and makes the body a problem from its message', async () => {
            const res = await appThrowing(
                new HTTPException(400, { message: 'Malformed JSON in request body' }),
            ).request('/');

            expect(await read(res)).toEqual({
                status: 400,
                type: PROBLEM_CONTENT_TYPE,
                body: {
                    type: 'about:blank',
                    title: 'Bad Request',
                    status: 400,
                    detail: 'Malformed JSON in request body',
                    code: 'bad_request',
                },
            });
        });

        it('has no detail when it has no message', async () => {
            const { body } = await read(await appThrowing(new HTTPException(401)).request('/'));

            expect(body).not.toHaveProperty('detail');
        });

        it('keeps the headers of its response but replaces the body, the content type and the status', async () => {
            const res = new Response('Unauthorized', {
                status: 200,
                headers: {
                    'WWW-Authenticate': 'Bearer realm="api"',
                    'Content-Type': 'text/plain',
                    'Content-Length': '12',
                },
            });

            const answer = await appThrowing(new HTTPException(401, { res })).request('/');

            expect(answer.status).toBe(401);
            expect(answer.headers.get('WWW-Authenticate')).toBe('Bearer realm="api"');
            expect(answer.headers.get('Content-Type')).toBe(PROBLEM_CONTENT_TYPE);
            expect(answer.headers.get('Content-Length')).not.toBe('12');
            expect(await answer.json()).toMatchObject({ status: 401, title: 'Unauthorized' });
        });

        it('with a 5xx status is answered generically and reported, so its message cannot leak', async () => {
            const onUnhandledError = mock((_error: unknown) => undefined);
            const error = new HTTPException(503, { message: 'redis password is hunter2' });

            const res = await appThrowing(error, { onUnhandledError }).request('/');
            const { status, body } = await read(res);

            expect(status).toBe(503);
            expect(body).toMatchObject({ title: 'Service Unavailable', detail: 'An unexpected error occurred.' });
            expect(JSON.stringify(body)).not.toContain('hunter2');
            expect(onUnhandledError).toHaveBeenCalledTimes(1);
            expect(onUnhandledError.mock.calls[0]).toContain(error);
        });

        it('with a 4xx status is not reported', async () => {
            const onUnhandledError = mock((_error: unknown) => undefined);

            await appThrowing(new HTTPException(404, { message: 'Gone.' }), { onUnhandledError }).request('/');

            expect(onUnhandledError).not.toHaveBeenCalled();
        });
    });

    describe('any other error', () => {
        it('is a generic 500, and its message is never in the response', async () => {
            const res = await appThrowing(new Error('connect ECONNREFUSED 10.0.0.5:5432')).request('/');
            const { status, type, body } = await read(res);

            expect([status, type]).toEqual([500, PROBLEM_CONTENT_TYPE]);
            expect(body).toEqual({
                type: 'about:blank',
                title: 'Internal Server Error',
                status: 500,
                detail: 'An unexpected error occurred.',
                code: 'internal_server_error',
            });
        });

        it('is reported with the original error, so it can be logged', async () => {
            const onUnhandledError = mock((_error: unknown) => undefined);
            const error = new Error('boom');

            await appThrowing(error, { onUnhandledError }).request('/');

            expect(onUnhandledError).toHaveBeenCalledTimes(1);
            expect(onUnhandledError.mock.calls[0]?.[0]).toBe(error);
        });

        it('is still answered when the reporter itself fails', async () => {
            const onUnhandledError = () => {
                throw new Error('the logger is down');
            };

            const res = await appThrowing(new Error('boom'), { onUnhandledError }).request('/');

            expect(res.status).toBe(500);
            expect(await res.json()).toMatchObject({ title: 'Internal Server Error' });
        });
    });

    describe('mapError', () => {
        const mapError = (error: unknown) =>
            (error as { code?: string })?.code === 'DUPLICATE' ? problem(409, 'That value is taken.') : undefined;

        it('turns an error it recognizes into a problem, without reporting it', async () => {
            const onUnhandledError = mock((_error: unknown) => undefined);

            const res = await appThrowing(Object.assign(new Error('insert into ...'), { code: 'DUPLICATE' }), {
                mapError,
                onUnhandledError,
            }).request('/');
            const { status, body } = await read(res);

            expect(status).toBe(409);
            expect(body).toMatchObject({ detail: 'That value is taken.', code: 'conflict' });
            expect(JSON.stringify(body)).not.toContain('insert into');
            expect(onUnhandledError).not.toHaveBeenCalled();
        });

        it('leaves an error it does not recognize to the default handling', async () => {
            const res = await appThrowing(new Error('other'), { mapError }).request('/');

            expect(res.status).toBe(500);
        });

        it('is asked about an HTTPException too, but not about a ProblemError', async () => {
            const seen: unknown[] = [];
            const options = {
                mapError: (error: unknown) => {
                    seen.push(error);

                    return undefined;
                },
            };
            const http = new HTTPException(404);

            await appThrowing(http, options).request('/');
            await appThrowing(problem(404), options).request('/');

            expect(seen).toEqual([http]);
        });

        it('is given the request context', async () => {
            let path: string | undefined;

            await appThrowing(new Error('x'), {
                mapError: (_error: unknown, c: Context) => {
                    path = c.req.path;

                    return undefined;
                },
            }).request('/');

            expect(path).toBe('/');
        });
    });

    describe('in an application', () => {
        it('also answers the errors of a mounted sub-app', async () => {
            const child = new Hono().get('/x', () => {
                throw problem(404, 'Child.');
            });
            const app = new Hono().onError(problemDetailsHandler()).route('/child', child);

            expect((await app.request('/child/x')).status).toBe(404);
        });

        it('keeps the CORS headers on an error response, so a browser can read the problem', async () => {
            const app = new Hono()
                .use('*', cors({ origin: ['http://localhost:5173'], credentials: true }))
                .onError(problemDetailsHandler())
                .get('/problem', () => {
                    throw problem(404, 'Gone.');
                })
                .get('/http', () => {
                    throw new HTTPException(401, {
                        res: new Response('x', { headers: { 'WWW-Authenticate': 'Bearer' } }),
                    });
                })
                .get('/boom', () => {
                    throw new Error('boom');
                });

            for (const path of ['/problem', '/http', '/boom']) {
                const res = await app.request(path, { headers: { Origin: 'http://localhost:5173' } });

                expect([path, res.headers.get('Access-Control-Allow-Origin')]).toEqual([path, 'http://localhost:5173']);
            }
        });
    });
});

describe('problemNotFound', () => {
    const app = new Hono().notFound(problemNotFound).get('/a', (c) => c.text('ok'));

    it('answers a request that matches no route with a 404 problem naming it', async () => {
        const res = await app.request('/nope');

        expect(await read(res)).toEqual({
            status: 404,
            type: PROBLEM_CONTENT_TYPE,
            body: {
                type: 'about:blank',
                title: 'Not Found',
                status: 404,
                detail: 'No route matches GET /nope.',
                code: 'not_found',
            },
        });
    });

    it('also answers a method that has no route on a path that has others', async () => {
        const res = await app.request('/a', { method: 'POST' });

        expect(res.status).toBe(404);
        expect(await res.json()).toMatchObject({ detail: 'No route matches POST /a.' });
    });

    it('answers for a mounted sub-app when it is registered on the top-level app', async () => {
        const top = new Hono().notFound(problemNotFound).route(
            '/api',
            new Hono().get('/a', (c) => c.text('ok')),
        );

        const res = await top.request('/api/nope');

        expect(res.headers.get('Content-Type')).toBe(PROBLEM_CONTENT_TYPE);
    });
});
