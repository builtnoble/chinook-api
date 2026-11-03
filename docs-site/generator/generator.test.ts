import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { compile } from '@mdx-js/mdx';
import type { OperationObject as Operation, SchemaObject as Schema, OpenAPIObject as Spec } from 'openapi3-ts/oas31';
import { generate, loadPages } from './index';
import { escapeMdx } from './render';
import { UnsupportedError } from './schema';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/openapi.json', import.meta.url), 'utf8')) as Spec;
const contentDir = new URL('./fixtures/content', import.meta.url).pathname;

// A one-operation spec, so each test states only what it changes.
const specWith = (operation: Partial<Operation>, extra: Partial<Spec> = {}): Spec => ({
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

const okResponse = (schema: Schema) => ({
    200: { description: 'OK', content: { 'application/json': { schema } } },
});

describe('generate', () => {
    it('writes one page per tag plus navigation and metadata', async () => {
        const files = generate(fixture, await loadPages(`${contentDir}/pages.json`));

        expect(Object.keys(files).sort()).toEqual([
            'src/app/albums/page.mdx',
            'src/app/artists/page.mdx',
            'src/app/insomnia/page.mdx',
            'src/app/page.mdx',
            'src/app/playlists/page.mdx',
            'src/generated/meta.json',
            'src/generated/navigation.json',
        ]);
        // The introduction stands alone, outside Guides and Resources.
        expect(JSON.parse(files['src/generated/navigation.json'])).toEqual([
            { links: [{ title: 'Introduction', href: '/' }] },
            {
                title: 'Guides',
                links: [
                    { title: 'Insomnia', href: '/insomnia', description: 'Send your first requests from Insomnia.' },
                ],
            },
            {
                title: 'Resources',
                links: [
                    { title: 'Albums', href: '/albums', description: 'Albums, each with the artist who made it.' },
                    { title: 'Artists', href: '/artists', description: 'Artists who have made albums.' },
                    { title: 'Playlists', href: '/playlists', description: 'Named playlists.' },
                ],
            },
        ]);
        expect(JSON.parse(files['src/generated/meta.json'])).toEqual({
            title: 'Chinook',
            version: '1.0.0',
            baseUrl: 'http://localhost:3000',
        });
    });

    it('leaves the introduction out of the navigation when there is none', () => {
        const navigation = JSON.parse(generate(fixture)['src/generated/navigation.json']);

        expect(navigation.map((group: { title?: string }) => group.title)).toEqual(['Guides', 'Resources']);
    });

    it('matches the recorded pages', () => {
        const files = generate(fixture);

        expect(files['src/app/albums/page.mdx']).toMatchSnapshot();
        expect(files['src/app/artists/page.mdx']).toMatchSnapshot();
        expect(files['src/app/playlists/page.mdx']).toMatchSnapshot();
    });

    it('is deterministic', () => {
        expect(generate(fixture)).toEqual(generate(structuredClone(fixture)));
    });

    it('produces pages that compile as MDX', async () => {
        for (const [path, contents] of Object.entries(generate(fixture))) {
            if (path.endsWith('.mdx')) {
                await expect(compile(contents)).resolves.toBeDefined();
            }
        }
    });

    it('documents what the by-id route returns, from the model on the same page', () => {
        const page = generate(fixture)['src/app/albums/page.mdx'];

        expect(page).toContain("## Retrieve an album {{ tag: 'GET', label: '/api/albums/:id' }}");
        expect(page).toContain('See [the album model](#the-album-model).');
        expect(page).toContain('"prev_page_url": null');
        expect(page).toContain('type="string | null"');
    });
});

describe('the artist writes in the fixture', () => {
    const page = () => generate(fixture)['src/app/artists/page.mdx'];

    it('has a section for each write, after the reads of the same path', () => {
        const headings = [...page().matchAll(/^## (.+) \{\{ tag: '(\w+)', label: '(.+)' \}\}$/gm)].map((match) =>
            match.slice(1).join(' | '),
        );

        expect(headings).toEqual([
            'List all artists | GET | /api/artists',
            'Create an artist | POST | /api/artists',
            'Retrieve an artist | GET | /api/artists/:id',
            'Update an artist | PATCH | /api/artists/:id',
            'Delete an artist | DELETE | /api/artists/:id',
        ]);
    });

    it('sends the body of a create with the model value and the content type', () => {
        expect(page()).toContain(`-d '{"name":"AC/DC"}'`);
        expect(page()).toContain("body: JSON.stringify({ name: 'AC/DC' }),");
    });

    it('shows the 404 on a read, and a body error on a write that is not about the id', () => {
        expect(page()).toContain('<Property name="404" type="error">');
        expect(page()).toContain('"message": "Invalid input: expected string, received number"');
    });

    it('documents the optional cascade parameter of a delete', () => {
        expect(page()).toContain('<Property name="cascade"');
    });

    it('shows the artist in the 404 example, not another resource', () => {
        expect(page()).toContain('"detail": "Artist not found."');
    });
});

describe('the playlist membership routes in the fixture', () => {
    const page = () => generate(fixture)['src/app/playlists/page.mdx'];

    it('has a section for adding and one for removing a track, after the playlist routes', () => {
        const headings = [...page().matchAll(/^## (.+) \{\{ tag: '(\w+)', label: '(.+)' \}\}$/gm)].map((match) =>
            match.slice(1).join(' | '),
        );

        expect(headings.slice(-2)).toEqual([
            'Add a track to a playlist | POST | /api/playlists/:id/tracks',
            'Remove a track from a playlist | DELETE | /api/playlists/:id/tracks/:track_id',
        ]);
    });

    it('fills the path, the body and the 404 in with the entry, not the playlist', () => {
        const add = page().slice(page().indexOf('## Add a track to a playlist'));

        expect(add).toContain('curl -X POST http://localhost:3000/api/playlists/1/tracks');
        expect(add).toContain(`-d '{"track_id":1}'`);
        expect(add).toContain('"detail": "Playlist not found."');
    });

    it('lists the attributes of the entry instead of linking to the playlist model', () => {
        const add = page().slice(page().indexOf('## Add a track to a playlist'));

        expect(add).toContain('<Property name="data.playlist_id"');
        expect(add).not.toContain('See [the playlist model]');
    });

    it('shows its own 404 message when removing a track that is not there', () => {
        const remove = page().slice(page().indexOf('## Remove a track from a playlist'));

        expect(remove).toContain('/api/playlists/1/tracks/1');
        expect(remove).toContain('"detail": "The playlist does not contain that track."');
    });
});

describe('MDX safety', () => {
    it('escapes braces and angle brackets outside code spans', () => {
        expect(escapeMdx('Use {id} or <b>bold</b>, but `{code}` stays.')).toBe(
            'Use \\{id\\} or \\<b>bold\\</b>, but `{code}` stays.',
        );
    });

    it('compiles a page whose descriptions contain MDX syntax', async () => {
        const spec = specWith({ description: 'Pass {id} as <id> and `{literal}`.\nSecond line.' });
        spec.tags = [{ name: 'Things', description: 'About {things} & <stuff>.' }];

        await expect(compile(generate(spec)['src/app/things/page.mdx'])).resolves.toBeDefined();
    });

    it('puts a type with quotes in an expression attribute', async () => {
        const spec = specWith({
            responses: okResponse({ type: 'object', properties: { kind: { enum: ['a', 'b'] } }, required: ['kind'] }),
        });
        const page = generate(spec)['src/app/things/page.mdx'];

        expect(page).toContain('type={"\\"a\\" | \\"b\\""}');
        await expect(compile(page)).resolves.toBeDefined();
    });
});

describe('schemas', () => {
    it('resolves $ref and allOf', () => {
        const spec = specWith(
            {
                responses: okResponse({
                    allOf: [
                        { $ref: '#/components/schemas/Base' },
                        { type: 'object', properties: { extra: { type: 'string' } } },
                    ],
                }),
            },
            {
                components: {
                    schemas: { Base: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
                },
            },
        );
        const page = generate(spec)['src/app/things/page.mdx'];

        expect(page).toContain('"id": 1');
        expect(page).toContain('"extra": "string"');
    });

    it('prefers an example in the spec over a synthesized value', () => {
        const spec = specWith({
            responses: okResponse({ type: 'object', properties: { name: { type: 'string', examples: ['AC/DC'] } } }),
        });

        expect(generate(spec)['src/app/things/page.mdx']).toContain('"name": "AC/DC"');
    });

    it('fails on a schema it cannot render, naming where', () => {
        const spec = specWith({
            responses: okResponse({ type: 'object', properties: { value: { not: { type: 'string' } } } }),
        });

        expect(() => generate(spec)).toThrow(UnsupportedError);
        expect(() => generate(spec)).toThrow('GET /things.responses.200.value: the "not" keyword is not supported');
    });

    it('fails on a $ref that loops or does not resolve', () => {
        const loop = specWith(
            { responses: okResponse({ $ref: '#/components/schemas/Node' }) },
            {
                components: {
                    schemas: { Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } } },
                },
            },
        );
        const missing = specWith({ responses: okResponse({ $ref: '#/components/schemas/Nope' }) });

        expect(() => generate(loop)).toThrow('refers to itself');
        expect(() => generate(missing)).toThrow('cannot resolve');
    });
});

describe('operations', () => {
    it('requires exactly one declared tag, a summary and a description', () => {
        expect(() => generate(specWith({ tags: [] }))).toThrow('expected exactly one tag');
        expect(() => generate(specWith({ tags: ['Other'] }))).toThrow('tag "Other" is not declared');
        expect(() => generate(specWith({ summary: undefined }))).toThrow('a summary and a description are required');
    });

    it('refuses a $ref where it expects a parameter, a request body or a response written out', () => {
        const ref = { $ref: '#/components/x/Thing' };

        expect(() => generate(specWith({ parameters: [ref] }))).toThrow('GET /things.parameters[0]: a $ref to');
        expect(() => generate(specWith({ requestBody: ref }))).toThrow('GET /things.requestBody: a $ref to');
        expect(() => generate(specWith({ responses: { 200: ref } }))).toThrow('GET /things.responses.200: a $ref to');
    });
});

// A resource with the reads and the writes the API offers, so each test can say
// what it changes.
const model: Schema = {
    type: 'object',
    properties: { id: { type: 'integer' }, name: { type: 'string' } },
    required: ['id', 'name'],
    examples: [{ id: 1, name: 'AC/DC' }],
};
const dataOf = (schema: Schema): Schema => ({ type: 'object', properties: { data: schema }, required: ['data'] });
const json = (schema: Schema) => ({ 'application/json': { schema } });
const secured = { security: [{ bearerAuth: [] }] };
const idParameter = { in: 'path' as const, name: 'id', required: true, schema: { type: 'number' as const } };
const errors = { 400: { description: 'Invalid.' }, 403: { description: 'Not an admin.' } };

const writeSpec = (overrides: Record<string, Record<string, Partial<Operation>>> = {}): Spec => {
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

const thingsPage = (spec = writeSpec()) => generate(spec)['src/app/things/page.mdx'];

// The text of one operation's section, from its heading to the next.
const sectionOf = (page: string, heading: string) => {
    const start = page.indexOf(`## ${heading} {{`);
    const end = page.indexOf('\n---\n', start);

    return page.slice(start, end === -1 ? undefined : end);
};

describe('error responses', () => {
    const problem: Schema = {
        type: 'object',
        properties: { status: { type: 'integer' }, detail: { type: 'string' } },
        required: ['status'],
        examples: [{ status: 404, detail: 'Thing not found.' }],
    };
    const withProblem = (content: Record<string, { schema: Schema }>) =>
        writeSpec({
            '/things/{id}': {
                get: {
                    tags: ['Things'],
                    summary: 'Retrieve a thing',
                    description: 'Retrieve a thing.',
                    parameters: [idParameter],
                    responses: { 200: { content: json(dataOf(model)) }, 404: { description: 'Missing.', content } },
                },
            },
        });

    it('renders an application/problem+json response like an application/json one', () => {
        const page = thingsPage(withProblem({ 'application/problem+json': { schema: problem } }));
        const section = sectionOf(page, 'Retrieve a thing');

        expect(section).toContain('Error response (404)');
        expect(section).toContain('"detail": "Thing not found."');
    });

    it('prefers application/json when a response declares both', () => {
        const other: Schema = { ...problem, examples: [{ status: 404, detail: 'From application/json.' }] };
        const page = thingsPage(
            withProblem({ 'application/problem+json': { schema: problem }, 'application/json': { schema: other } }),
        );

        expect(sectionOf(page, 'Retrieve a thing')).toContain('"detail": "From application/json."');
    });
});

describe('write operations', () => {
    it('lists a collection first, then each item operation in method order', () => {
        const headings = [...thingsPage().matchAll(/^## (.+) \{\{ tag: '(\w+)'/gm)].map((match) => match[2]);

        expect(headings).toEqual(['GET', 'POST', 'GET', 'PATCH', 'DELETE']);
    });

    it('sends the body of a create in the cURL example, with the JSON content type', () => {
        const create = sectionOf(thingsPage(), 'Create a thing');

        expect(create).toContain('curl -X POST http://api.test/things \\');
        expect(create).toContain('-H "Authorization: Bearer {token}" \\');
        expect(create).toContain('-H "Content-Type: application/json" \\');
        expect(create).toContain(`-d '{"name":"AC/DC","note":"string"}'`);
    });

    it('sets the method, headers and body in the JavaScript example', () => {
        const create = sectionOf(thingsPage(), 'Create a thing');

        expect(create).toContain("method: 'POST',");
        expect(create).toContain("'Content-Type': 'application/json',");
        expect(create).toContain("body: JSON.stringify({ name: 'AC/DC', note: 'string' }),");
    });

    it('takes body values from the model, and synthesizes a field the model lacks', () => {
        const spec = writeSpec({
            '/things': {
                post: {
                    ...writeSpec().paths?.['/things']?.post,
                    requestBody: {
                        content: json({
                            type: 'object',
                            properties: { name: { type: 'string' }, track_id: { type: 'integer' } },
                        }),
                    },
                },
            },
        });

        expect(sectionOf(thingsPage(spec), 'Create a thing')).toContain(`-d '{"name":"AC/DC","track_id":1}'`);
    });

    it('lays a long body out one property per line', () => {
        const long = {
            type: 'object',
            properties: Object.fromEntries(
                ['composer', 'milliseconds', 'unit_price'].map((name) => [
                    name,
                    { type: 'string', examples: ['x'.repeat(16)] },
                ]),
            ),
        } satisfies Schema;
        const spec = writeSpec({
            '/things': { post: { ...writeSpec().paths?.['/things']?.post, requestBody: { content: json(long) } } },
        });
        const create = sectionOf(thingsPage(spec), 'Create a thing');

        expect(create).toContain('body: JSON.stringify({\n        composer: ');
        // The page indents its code blocks by four spaces, and the JSON adds
        // two more.
        expect(create).toContain(`-d '{\n      "composer": `);
    });

    it('escapes a quote in the body for the shell and for JavaScript', () => {
        const quoted = {
            type: 'object',
            properties: { title: { type: 'string', examples: ["Rock 'n' Roll"] } },
        } satisfies Schema;
        const spec = writeSpec({
            '/things': { post: { ...writeSpec().paths?.['/things']?.post, requestBody: { content: json(quoted) } } },
        });
        const create = sectionOf(thingsPage(spec), 'Create a thing');

        expect(create).toContain(String.raw`-d '{"title":"Rock '\''n'\'' Roll"}'`);
        expect(create).toContain(String.raw`body: JSON.stringify({ title: 'Rock \'n\' Roll' }),`);
    });

    it('documents the body fields, required ones apart from optional ones', () => {
        const create = sectionOf(thingsPage(), 'Create a thing');
        const update = sectionOf(thingsPage(), 'Update a thing');

        expect(create).toContain('### Required attributes');
        expect(create).toContain('<Property name="name" type="string">\n        Name of the thing.');
        expect(create).toContain('### Optional attributes');
        expect(create).toContain('<Property name="note" type="string, optional">');
        // Every field of an update is optional, so there is nothing required to
        // list.
        expect(update).not.toContain('### Required attributes');
        expect(update).toContain('### Optional attributes');
    });

    it('leaves a read and a delete without a body', () => {
        const page = thingsPage();

        for (const heading of ['List things', 'Retrieve a thing', 'Delete a thing']) {
            const section = sectionOf(page, heading);

            expect(section).not.toContain('Content-Type');
            expect(section).not.toContain('-d ');
            expect(section).not.toContain('Required attributes');
            expect(section).not.toContain('Optional attributes');
        }
        expect(sectionOf(page, 'Delete a thing')).toContain("method: 'DELETE',");
        // biome-ignore lint/suspicious/noTemplateCurlyInString: `${token}` belongs to the generated example
        expect(sectionOf(page, 'Delete a thing')).toContain('headers: { Authorization: `Bearer ${token}` },');
    });

    it('documents a 201 response, its attributes and its example, and keeps it out of the errors', () => {
        const create = sectionOf(thingsPage(), 'Create a thing');

        expect(create).toContain('### Response attributes');
        expect(create).toContain('The thing. See [the thing model](#the-thing-model).');
        expect(create).toContain("```json {{ title: 'Response' }}");
        expect(create).toContain('<Property name="403" type="error">');
        expect(create).not.toContain('<Property name="201"');
    });

    it('takes the model from a read, not from a write that answers with another shape', () => {
        const membership = {
            post: {
                tags: ['Things'],
                summary: 'Add a part',
                description: 'Adds a part.',
                parameters: [idParameter],
                requestBody: { content: json({ type: 'object', properties: { part_id: { type: 'integer' } } }) },
                responses: {
                    201: { content: json(dataOf({ type: 'object', properties: { part_id: { type: 'integer' } } })) },
                },
            },
        };
        const page = thingsPage(writeSpec({ '/things/{id}/parts': membership }));

        expect(page).toContain('## The thing model');
        expect(page.split('## The thing model')[1].split('---')[0]).toContain('name="name"');
        expect(page.split('## The thing model')[1].split('---')[0]).not.toContain('part_id');
        expect(page.indexOf('## Add a part')).toBeGreaterThan(page.indexOf('## Delete a thing'));

        // Its own response is not the model, so the page lists the attributes
        // instead of linking to the model.
        const add = sectionOf(page, 'Add a part');

        expect(add).toContain('<Property name="data.part_id" type="integer, optional">');
        expect(add).not.toContain('See [the thing model]');
        expect(sectionOf(page, 'Create a thing')).toContain('See [the thing model](#the-thing-model).');
    });

    it('compiles every write page as MDX', async () => {
        await expect(compile(thingsPage())).resolves.toBeDefined();
    });

    it('rejects a request body that is not JSON, naming the operation', () => {
        const spec = writeSpec({
            '/things': {
                post: {
                    ...writeSpec().paths?.['/things']?.post,
                    requestBody: { content: { 'multipart/form-data': { schema: { type: 'object' } } } },
                },
            },
        });

        expect(() => generate(spec)).toThrow('POST /things: only a JSON request body is supported');
    });
});
