/// <reference types="bun" />
import { beforeAll, describe, expect, it } from 'bun:test';

// The docs site is generated from this document, so every operation needs enough in it to render a page.
type Operation = {
    operationId?: string;
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
    const { default: app } = await import('./index');
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
    it('describes all twelve data operations', () => {
        expect(operations).toHaveLength(12);
    });

    it('gives every operation an id, a tag, a summary and a description', () => {
        for (const [name, operation] of operations) {
            // Pairing each value with the operation name makes a failure say which operation is incomplete.
            expect([name, typeof operation.operationId]).toEqual([name, 'string']);
            expect([name, operation.tags?.length]).toEqual([name, 1]);
            expect([name, typeof operation.summary]).toEqual([name, 'string']);
            expect([name, typeof operation.description]).toEqual([name, 'string']);
        }
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

    it('documents the 400 and 401 responses and requires the bearer scheme', () => {
        expect(spec.components.securitySchemes).toHaveProperty('bearerAuth');

        for (const [, operation] of operations) {
            expect(Object.keys(operation.responses ?? {})).toEqual(['200', '400', '401']);
            expect(operation.security).toEqual([{ bearerAuth: [] }]);
        }
    });
});
