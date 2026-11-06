import { beforeAll, describe, expect, it } from 'bun:test';

// The docs site is generated from this document, so every operation needs
// enough in it to render a page.
type Operation = {
    operationId?: string;
    requestBody?: { required?: boolean; content?: Record<string, unknown> };
    tags?: string[];
    summary?: string;
    description?: string;
    security?: unknown[];
    responses?: Record<string, unknown>;
};

type Spec = {
    servers: { url: string }[];
    tags: { name: string; description?: string }[];
    paths: Record<string, Record<string, Operation>>;
    components: { securitySchemes: Record<string, unknown> };
};

let spec: Spec;
let operations: [string, Operation][];

beforeAll(async () => {
    const { default: app } = await import('@/index');
    const response = await app.fetch(new Request('http://localhost/openapi.json'));

    spec = (await response.json()) as Spec;
    operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
        Object.entries(methods).map(([method, operation]): [string, Operation] => [
            `${method.toUpperCase()} ${path}`,
            operation,
        ]),
    );
});

describe('openapi.json', () => {
    it('describes all thirty-three data operations', () => {
        expect(operations).toHaveLength(33);
    });

    it('gives every operation an id, a tag, a summary and a description', () => {
        for (const [name, operation] of operations) {
            // Pairing each value with the operation name makes a failure say
            // which operation is incomplete.
            expect([name, typeof operation.operationId]).toEqual([name, 'string']);
            expect([name, operation.tags?.length]).toEqual([name, 1]);
            expect([name, typeof operation.summary]).toEqual([name, 'string']);
            expect([name, typeof operation.description]).toEqual([name, 'string']);
        }
    });

    it('does not expose the soft-delete column', () => {
        // deleted_at is how the API remembers a deleted row. Reads leave those
        // rows out, so clients never need it.
        expect(JSON.stringify(spec)).not.toContain('deleted_at');
    });

    it('lists the compose proxy first and the direct port second', () => {
        expect(spec.servers.map((server) => server.url)).toEqual([
            'http://api.chinook.localhost',
            expect.stringMatching(/^http:\/\/localhost:\d+$/),
        ]);
    });

    it('only uses tags that are declared with a description', () => {
        const declared = new Map(spec.tags.map((tag) => [tag.name, tag.description]));

        for (const [, operation] of operations) {
            for (const tag of operation.tags ?? []) {
                expect([tag, typeof declared.get(tag)]).toEqual([tag, 'string']);
            }
        }
    });

    it('wraps every by-id response in data, as the handlers do', () => {
        for (const [name, operation] of operations.filter(([name]) => name.endsWith('/{id}'))) {
            const schema = (operation.responses?.[200] as { content: Record<string, { schema: object }> }).content[
                'application/json'
            ].schema;

            expect([name, Object.keys((schema as { properties: object }).properties)]).toEqual([name, ['data']]);
        }
    });

    it('requires the bearer scheme on every operation', () => {
        expect(spec.components.securitySchemes).toHaveProperty('bearerAuth');

        for (const [, operation] of operations) {
            expect(operation.security).toEqual([{ bearerAuth: [] }]);
        }
    });

    // Statuses every operation of a kind documents. An operation may document
    // more, such as a 409 on a delete.
    const required: Record<string, string[]> = {
        GET: ['200', '400', '401'],
        POST: ['201', '400', '401', '403'],
        PATCH: ['200', '400', '401', '403', '404'],
        DELETE: ['200', '400', '401', '403', '404'],
    };

    it.each(Object.keys(required))('documents the responses of every %s', (method) => {
        for (const [name, operation] of operations.filter(([name]) => name.startsWith(`${method} `))) {
            // A read by id also answers 404 for an unknown or deleted id.
            const expected = name.endsWith('/{id}') && method === 'GET' ? [...required.GET, '404'] : required[method];

            for (const status of expected) {
                expect([name, status in (operation.responses ?? {})]).toEqual([name, true]);
            }
        }
    });

    it('documents every error as a problem document and every success as JSON', () => {
        for (const [name, operation] of operations) {
            for (const [status, response] of Object.entries(operation.responses ?? {})) {
                const types = Object.keys((response as { content: object }).content);

                expect([name, status, types]).toEqual([
                    name,
                    status,
                    [status.startsWith('2') ? 'application/json' : 'application/problem+json'],
                ]);
            }
        }
    });

    it('declares the WWW-Authenticate header on every 401', () => {
        for (const [name, operation] of operations) {
            const response = operation.responses?.[401] as { headers?: Record<string, unknown> };

            expect([name, Object.keys(response.headers ?? {})]).toEqual([name, ['WWW-Authenticate']]);
        }
    });

    it('takes a JSON request body on every create and update, and none elsewhere', () => {
        for (const [name, operation] of operations) {
            const writes = name.startsWith('POST ') || name.startsWith('PATCH ');

            if (writes) {
                expect([name, operation.requestBody?.required]).toEqual([name, true]);
                expect([name, Object.keys(operation.requestBody?.content ?? {})]).toEqual([name, ['application/json']]);
            } else {
                expect([name, operation.requestBody]).toEqual([name, undefined]);
            }
        }
    });

    it('documents one success status per operation: 201 for a create, 200 for the rest', () => {
        for (const [name, operation] of operations) {
            const success = Object.keys(operation.responses ?? {}).filter((status) => status.startsWith('2'));

            expect([name, success]).toEqual([name, [name.startsWith('POST ') ? '201' : '200']]);
        }
    });
});
