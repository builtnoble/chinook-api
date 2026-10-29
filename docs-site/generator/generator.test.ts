import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { compile } from '@mdx-js/mdx';
import { generate, loadPages } from './index';
import { escapeMdx } from './render';
import { UnsupportedError } from './schema';
import type { Operation, Schema, Spec } from './types';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/openapi.json', import.meta.url), 'utf8')) as Spec;
const contentDir = new URL('./fixtures/content', import.meta.url).pathname;

// A one-operation spec, so each test states only what it changes.
const specWith = (operation: Partial<Operation>, extra: Partial<Spec> = {}): Spec => ({
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
});
