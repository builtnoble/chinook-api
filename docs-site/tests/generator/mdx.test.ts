import { describe, expect, it } from 'bun:test';
import { compile } from '@mdx-js/mdx';
import { generate } from '@/index';
import { okResponse, specWith } from '../support/spec';

describe('MDX safety', () => {
    it('escapes braces and angle brackets outside code spans', () => {
        const spec = specWith({ description: 'Use {id} or <b>bold</b>, but `{code}` stays.' });

        expect(generate(spec)['src/app/things/page.mdx']).toContain(
            'Use \\{id} or \\<b>bold\\</b>, but `{code}` stays.',
        );
    });

    it('refuses a description that is more than one paragraph', () => {
        const spec = specWith({ description: '- one\n- two' });

        expect(() => generate(spec)).toThrow('GET /things: a description must be a single paragraph');
    });

    it('compiles a page whose descriptions contain MDX syntax', async () => {
        const spec = specWith({ description: 'Pass {id} as <id> and `{literal}`.\nSecond line.' });
        spec.tags = [{ name: 'Things', description: 'About {things} & <stuff>.' }];

        await expect(compile(generate(spec)['src/app/things/page.mdx'])).resolves.toBeDefined();
    });

    it('keeps a type with quotes in one attribute', async () => {
        const spec = specWith({
            responses: okResponse({ type: 'object', properties: { kind: { enum: ['a', 'b'] } }, required: ['kind'] }),
        });
        const page = generate(spec)['src/app/things/page.mdx'];

        expect(String(await compile(page))).toContain('type: "\\"a\\" | \\"b\\""');
    });
});
