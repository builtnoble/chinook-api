import type { OperationObject as Operation, SchemaObject as Schema, OpenAPIObject as Spec } from 'openapi3-ts/oas31';
import { generate } from '@/index';

// A one-operation spec, so each test states only what it changes.
export const specWith = (operation: Partial<Operation>, extra: Partial<Spec> = {}): Spec => ({
    openapi: '3.1.0',
    info: { title: 'Test', version: '1.0.0' },
    tags: [{ name: 'Things', description: 'Some things.' }],
    paths: {
        '/things': {
            get: {
                tags: ['Things'],
                summary: 'List things',
                description: 'Lists things.',
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } },
                },
                ...operation,
            },
        },
    },
    ...extra,
});

export const okResponse = (schema: Schema) => ({
    200: { description: 'OK', content: { 'application/json': { schema } } },
});

// A resource with the reads and the writes the API offers, so each test can say
// what it changes.
export const model: Schema = {
    type: 'object',
    properties: { id: { type: 'integer' }, name: { type: 'string' } },
    required: ['id', 'name'],
    examples: [{ id: 1, name: 'AC/DC' }],
};
export const dataOf = (schema: Schema): Schema => ({
    type: 'object',
    properties: { data: schema },
    required: ['data'],
});
export const json = (schema: Schema) => ({ 'application/json': { schema } });
const secured = { security: [{ bearerAuth: [] }] };
export const idParameter = { in: 'path' as const, name: 'id', required: true, schema: { type: 'number' as const } };
const errors = { 400: { description: 'Invalid.' }, 403: { description: 'Not an admin.' } };

export const writeSpec = (overrides: Record<string, Record<string, Partial<Operation>>> = {}): Spec => {
    const operation = (summary: string, extra: Partial<Operation>): Operation => ({
        tags: ['Things'],
        summary,
        description: `${summary}.`,
        ...secured,
        ...extra,
    });

    const body = (schema: Schema) => ({ required: true, content: json(schema) });
    const createBody: Schema = {
        type: 'object',
        properties: { name: { type: 'string', description: 'Name of the thing.' }, note: { type: 'string' } },
        required: ['name'],
        additionalProperties: false,
    };

    const paths: Spec['paths'] = {
        '/things': {
            get: operation('List things', {
                responses: { 200: { content: json(dataOf({ type: 'array', items: model })) } },
            }),
            post: operation('Create a thing', {
                requestBody: body(createBody),
                responses: { 201: { description: 'Created.', content: json(dataOf(model)) }, ...errors },
            }),
        },
        '/things/{id}': {
            get: operation('Retrieve a thing', {
                parameters: [idParameter],
                responses: { 200: { content: json(dataOf(model)) } },
            }),
            patch: operation('Update a thing', {
                parameters: [idParameter],
                requestBody: body({ ...createBody, required: [] }),
                responses: { 200: { content: json(dataOf(model)) }, ...errors },
            }),
            delete: operation('Delete a thing', {
                parameters: [idParameter],
                responses: { 200: { content: json(dataOf(model)) }, ...errors },
            }),
        },
    };

    for (const [path, methods] of Object.entries(overrides)) {
        paths[path] = { ...paths[path], ...(methods as Record<string, Operation>) };
    }

    return {
        openapi: '3.1.0',
        info: { title: 'Test', version: '1.0.0' },
        servers: [{ url: 'http://api.test' }],
        tags: [{ name: 'Things', description: 'Some things.' }],
        paths,
    };
};

export const thingsPage = (spec = writeSpec()) => generate(spec)['src/app/things/page.mdx'];

// The text of one operation's section, from its heading to the next.
export const sectionOf = (page: string, heading: string) => {
    const start = page.indexOf(`## ${heading} {{`);
    const end = page.indexOf('\n---\n', start);

    return page.slice(start, end === -1 ? undefined : end);
};
