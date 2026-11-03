import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import app from '@/index';
import { statusTitle } from '@/lib/problem-details';
import { maxBodyBytes } from '@/middleware/bodyLimitMiddleware';
import { auth } from '@/utils/auth';

// Every way a request can fail, sent through the whole app, so a new error that
// skips the problem format shows up here.

const spies: { mockRestore: () => void }[] = [];

afterEach(() => {
    for (const spy of spies.splice(0)) {
        spy.mockRestore();
    }
});

const signedInAs = (role: string | null) => {
    const session = role === null ? null : { user: { id: 'u1', role }, session: { id: 's1' } };

    spies.push(spyOn(auth.api, 'getSession').mockResolvedValue(session as never));
};

const json = { 'Content-Type': 'application/json' };

type Failure = [
    label: string,
    role: string | null,
    request: { method: string; path: string; headers?: Record<string, string>; body?: string },
    status: number,
    code: string,
];

const failures: Failure[] = [
    ['a route that does not exist', 'admin', { method: 'GET', path: '/nope' }, 404, 'not_found'],
    ['a route under /api that does not exist', 'admin', { method: 'GET', path: '/api/nope' }, 404, 'not_found'],
    ['a route under /api/auth that does not exist', null, { method: 'GET', path: '/api/auth/nope' }, 404, 'not_found'],
    [
        'a sign-in with no password',
        null,
        { method: 'POST', path: '/api/auth/sign-in/email', headers: json, body: '{"email":"a@example.test"}' },
        400,
        'validation_failed',
    ],
    ['no session', null, { method: 'GET', path: '/api/artists' }, 401, 'unauthorized'],
    [
        'a write by a user who is not an admin',
        'user',
        { method: 'POST', path: '/api/artists', headers: json, body: '{}' },
        403,
        'forbidden',
    ],
    [
        'a cookie write from an unlisted origin',
        'admin',
        {
            method: 'POST',
            path: '/api/artists',
            headers: { ...json, Cookie: 'a=b', Origin: 'http://evil.test' },
            body: '{}',
        },
        403,
        'origin_not_allowed',
    ],
    [
        'a path parameter that is not a number',
        'user',
        { method: 'GET', path: '/api/artists/abc' },
        400,
        'validation_failed',
    ],
    [
        'a body with a missing field',
        'admin',
        { method: 'POST', path: '/api/artists', headers: json, body: '{}' },
        400,
        'validation_failed',
    ],
    [
        'a body that is not JSON',
        'admin',
        { method: 'POST', path: '/api/artists', headers: json, body: '{"name": ' },
        400,
        'bad_request',
    ],
    [
        'a body over the size limit',
        'admin',
        { method: 'POST', path: '/api/artists', headers: json, body: 'x'.repeat(maxBodyBytes + 1) },
        413,
        'content_too_large',
    ],
];

describe('every failed request', () => {
    it.each(failures)(
        'is answered as a problem document: %s',
        async (_, role, { method, path, headers, body }, status, code) => {
            signedInAs(role);

            // A client declares the length of its body, which is how the size
            // limit rejects an oversized one before reading it.
            const length: Record<string, string> =
                body === undefined ? {} : { 'Content-Length': String(new TextEncoder().encode(body).length) };
            const res = await app.fetch(
                new Request(`http://localhost${path}`, { method, headers: { ...headers, ...length }, body }),
            );

            expect(res.status).toBe(status);
            expect(res.headers.get('Content-Type')).toBe('application/problem+json');
            const document = await res.json();

            expect(document).toMatchObject({ type: 'about:blank', title: statusTitle(status), status, code });
            // The detail is optional, and Better Auth may send none.
            expect(['string', 'undefined']).toContain(typeof document.detail);
        },
    );
});

// The examples in the OpenAPI document are what the docs site shows, so each
// one has to be a body the API really sends.
describe('the examples in the OpenAPI document', () => {
    type Schema = { examples?: unknown[]; anyOf?: Schema[] };
    type Spec = {
        paths: Record<
            string,
            Record<string, { responses: Record<string, { content: Record<string, { schema: Schema }> }> }>
        >;
    };

    const documented = async (path: string, method: string, status: string, variant = 0, example = 0) => {
        const spec = (await (await app.fetch(new Request('http://localhost/openapi.json'))).json()) as Spec;
        const { schema } = spec.paths[path][method].responses[status].content['application/problem+json'];

        return (schema.anyOf?.[variant] ?? schema).examples?.[example];
    };

    const sent = async (
        role: string | null,
        init: { method: string; path: string; headers?: Record<string, string>; body?: string },
    ) => {
        signedInAs(role);

        const res = await app.fetch(new Request(`http://localhost${init.path}`, init));

        return res.json();
    };

    it('shows a 401 as it is sent', async () => {
        expect(await sent(null, { method: 'GET', path: '/api/artists' })).toEqual(
            await documented('/api/artists', 'get', '401'),
        );
    });

    it('shows a validation failure as it is sent', async () => {
        expect(await sent('user', { method: 'GET', path: '/api/artists/abc' })).toEqual(
            await documented('/api/artists/{id}', 'get', '400'),
        );
    });

    it('shows a 403 for a missing admin role as it is sent', async () => {
        expect(await sent('user', { method: 'POST', path: '/api/artists', headers: json, body: '{}' })).toEqual(
            await documented('/api/artists', 'post', '403'),
        );
    });

    it('shows a 403 for a foreign origin as it is sent', async () => {
        const headers = { ...json, Cookie: 'a=b', Origin: 'http://evil.test' };

        expect(await sent('admin', { method: 'POST', path: '/api/artists', headers, body: '{}' })).toEqual(
            await documented('/api/artists', 'post', '403', 0, 1),
        );
    });

    it('shows malformed JSON as it is sent', async () => {
        expect(await sent('admin', { method: 'POST', path: '/api/artists', headers: json, body: '{"name": ' })).toEqual(
            await documented('/api/artists', 'post', '400', 1),
        );
    });
});
