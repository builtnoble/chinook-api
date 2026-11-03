import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { describeRoute, openAPIRouteHandler, validator } from 'hono-openapi';
import z from 'zod';
import { problem, problemDetailsHandler, validationHook } from '@/lib/problem-details';
import {
    problemExample,
    problemResponse,
    validationExample,
    validationProblemResponse,
} from '@/lib/problem-details/openapi';

type Responses = NonNullable<Parameters<typeof describeRoute>[0]['responses']>;
type Media = {
    schema: { examples?: unknown[]; anyOf?: { examples?: unknown[]; required?: string[] }[]; required?: string[] };
};

// The OpenAPI document of an app with one route that has these responses.
const documented = async (responses: Responses) => {
    const app = new Hono().get(
        '/things',
        describeRoute({ responses: { 200: { description: 'Fine.' }, ...responses } }),
        (c) => c.json({}),
    );
    app.get(
        '/openapi.json',
        openAPIRouteHandler(app, { documentation: { info: { title: 'Test', version: '1.0.0' } } }),
    );

    const spec = (await (await app.request('/openapi.json')).json()) as {
        paths: Record<
            string,
            Record<string, { responses: Record<string, { description: string; content: Record<string, Media> }> }>
        >;
    };

    return spec.paths['/things'].get.responses;
};

describe('problemExample', () => {
    it('is the document the problem is sent as', async () => {
        const app = new Hono().onError(problemDetailsHandler()).get('/', () => {
            throw problem(409, 'Already there.', { code: 'duplicate_value' });
        });

        const sent = await (await app.request('/')).json();

        expect(problemExample(409, 'Already there.', { code: 'duplicate_value' })).toEqual(sent);
    });
});

describe('problemResponse', () => {
    it('documents a problem document with the content type and its examples', async () => {
        const responses = await documented({
            404: problemResponse('Not there.', problemExample(404, 'Thing not found.')),
        });
        const { description, content } = responses[404];
        const schema = content['application/problem+json'].schema;

        expect(description).toBe('Not there.');
        expect(Object.keys(content)).toEqual(['application/problem+json']);
        expect(schema.required).toEqual(expect.arrayContaining(['type', 'title', 'status']));
        expect(schema.examples).toEqual([problemExample(404, 'Thing not found.')]);
    });

    it('lists every example it is given', async () => {
        const responses = await documented({
            403: problemResponse('No.', problemExample(403, 'One.'), problemExample(403, 'Two.', { code: 'two' })),
        });

        expect(responses[403].content['application/problem+json'].schema.examples).toHaveLength(2);
    });
});

describe('validationProblemResponse', () => {
    it('adds the other problems with the same status as a second shape', async () => {
        const invalid = validationExample('/id', 'path', 'Invalid input: expected number, received NaN');
        const other = problemExample(400, 'Malformed JSON in request body');
        const responses = await documented({ 400: validationProblemResponse('Invalid.', invalid, other) });
        const { anyOf } = responses[400].content['application/problem+json'].schema;

        expect(anyOf).toHaveLength(2);
        expect(anyOf?.[0].examples).toEqual([invalid]);
        expect(anyOf?.[0].required).toContain('errors');
        expect(anyOf?.[1].examples).toEqual([other]);
    });
});

describe('validationExample', () => {
    // The example is what the docs show, so it has to be what the hook sends.
    it.each([['json', 'body', '/name', { name: 42 }, 'Invalid input: expected string, received number']] as const)(
        'is the document validationHook sends for a bad %s',
        async (target, location, field, body, message) => {
            const app = new Hono()
                .onError(problemDetailsHandler())
                .post('/', validator(target, z.object({ name: z.string() }), validationHook()), (c) => c.json({}));

            const res = await app.request('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            expect(res.status).toBe(400);
            expect(await res.json()).toEqual(validationExample(field, location, message));
        },
    );

    it('says which part of the request the value is in, and takes another validator code', () => {
        const [issue] = validationExample('/page', 'query', 'Too big.', 'too_big').errors ?? [];

        expect(issue).toEqual({ field: '/page', in: 'query', message: 'Too big.', code: 'too_big' });
    });
});
