import { describe, expect, it } from 'bun:test';
import { generate } from '@/index';
import { dereference, UnsupportedError } from '@/schema';
import { okResponse, specWith } from '../support/spec';

describe('schemas', () => {
    it('resolves $ref and allOf', async () => {
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
        const page = generate(await dereference(spec))['src/app/things/page.mdx'];

        expect(page).toContain('"id": 0');
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

    it('fails on a $ref that loops, does not resolve or points outside the document', async () => {
        const loop = specWith(
            { responses: okResponse({ $ref: '#/components/schemas/Node' }) },
            {
                components: {
                    schemas: { Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } } },
                },
            },
        );
        const missing = specWith({ responses: okResponse({ $ref: '#/components/schemas/Nope' }) });
        const outside = specWith({ responses: okResponse({ $ref: 'https://example.com/thing.json' }) });

        const looped = await dereference(loop);
        const external = await dereference(outside);

        expect(() => generate(looped)).toThrow('refers to itself');
        expect(() => generate(external)).toThrow('lies outside the document');
        await expect(dereference(missing)).rejects.toThrow('cannot resolve a $ref');
    });
});
