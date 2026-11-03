import { describe, expect, it } from 'bun:test';
import { compile } from '@mdx-js/mdx';
import slugify from '@sindresorhus/slugify';
import type { SchemaObject as Schema } from 'openapi3-ts/oas31';
import { generate } from '@/index';
import { dereference } from '@/schema';
import { fixture } from '../support/fixture';
import { dataOf, idParameter, json, model, sectionOf, specWith, thingsPage, writeSpec } from '../support/spec';

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
        expect(page()).toMatch(/--data '\s*\{\s*"name":\s*"AC\/DC"\s*\}\s*'/);
        expect(page()).toContain("body: JSON.stringify({name: 'AC/DC'})");
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

        expect(add).toContain('--request POST');
        expect(add).toContain('--url http://localhost:3000/api/playlists/1/tracks');
        expect(add).toMatch(/--data '\s*\{\s*"track_id":\s*1\s*\}\s*'/);
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

describe('links within a page', () => {
    it('point at a heading that exists, under the id the theme gives it', () => {
        const pages = Object.entries(generate(fixture)).filter(([path]) => path.endsWith('page.mdx'));

        expect(pages.length).toBeGreaterThan(0);
        for (const [path, page] of pages) {
            // The theme builds an h2's anchor from its text with slugify,
            // leaving out the {{ ... }} part.
            const ids = new Set([...page.matchAll(/^## (.+?)(?: \{\{.*\}\})?$/gm)].map((match) => slugify(match[1])));

            for (const [, target] of page.matchAll(/\]\(#([^)]+)\)/g)) {
                expect([path, target, ids.has(target)]).toEqual([path, target, true]);
            }
        }
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

    it('follows a $ref to a shared parameter', async () => {
        const spec = specWith(
            { parameters: [{ $ref: '#/components/parameters/Limit' }] },
            {
                components: {
                    parameters: {
                        Limit: {
                            name: 'limit',
                            in: 'query',
                            required: true,
                            description: 'Page size.',
                            schema: { type: 'integer' },
                        },
                    },
                },
            },
        );
        const page = generate(await dereference(spec))['src/app/things/page.mdx'];

        expect(page).toContain('<Property name="limit" type="integer">');
        expect(page).toContain("--url '/things?limit=0'");
    });
});

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

        expect(create).toContain('--request POST');
        expect(create).toContain('--url http://api.test/things');
        expect(create).toContain("--header 'Authorization: Bearer {token}'");
        expect(create).toContain("--header 'Content-Type: application/json'");
        expect(create).toMatch(/--data '\s*\{\s*"name":\s*"AC\/DC",\s*"note":\s*"string"\s*\}\s*'/);
    });

    it('sets the method, headers and body in the JavaScript example', () => {
        const create = sectionOf(thingsPage(), 'Create a thing');

        expect(create).toContain("method: 'POST',");
        expect(create).toContain("'Content-Type': 'application/json'");
        expect(create).toContain("body: JSON.stringify({name: 'AC/DC', note: 'string'})");
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

        expect(sectionOf(thingsPage(spec), 'Create a thing')).toMatch(/"name":\s*"AC\/DC",\s*"track_id":\s*0/);
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

        // The shell example puts the body in a here-document, where a quote
        // needs no escaping.
        expect(create).toContain('--data @- <<EOF');
        expect(create).toContain(`"title": "Rock 'n' Roll"`);
        expect(create).toContain(String.raw`body: JSON.stringify({title: 'Rock \'n\' Roll'})`);
    });

    it('documents the body fields, required ones apart from optional ones', () => {
        const create = sectionOf(thingsPage(), 'Create a thing');
        const update = sectionOf(thingsPage(), 'Update a thing');

        expect(create).toContain('### Required attributes');
        expect(create).toContain('<Property name="name" type="string">\n        Name of the thing.');
        expect(create).toContain('### Optional attributes');
        expect(create).toContain('<Property name="note" type="string, optional">');
        // Every field of an update is optional, so no required fields are
        // listed.
        expect(update).not.toContain('### Required attributes');
        expect(update).toContain('### Optional attributes');
    });

    it('leaves a read and a delete without a body', () => {
        const page = thingsPage();

        for (const heading of ['List things', 'Retrieve a thing', 'Delete a thing']) {
            const section = sectionOf(page, heading);

            expect(section).not.toContain('Content-Type');
            expect(section).not.toContain('--data');
            expect(section).not.toContain('Required attributes');
            expect(section).not.toContain('Optional attributes');
        }
        expect(sectionOf(page, 'Delete a thing')).toContain("method: 'DELETE'");
        expect(sectionOf(page, 'Delete a thing')).toContain("headers: {Authorization: 'Bearer {token}'}");
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

        // Its response is not the model, so the page lists the attributes
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
