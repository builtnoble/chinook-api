import { describe, expect, it } from 'bun:test';
import { compile } from '@mdx-js/mdx';
import { markdownToMdx } from './markdown';
import { UnsupportedError } from './schema';

const options = {
    path: 'docs/GUIDE.md',
    published: new Map([
        ['docs/OTHER.md', '/other'],
        ['docs/INTRODUCTION.md', '/'],
    ]),
    repository: 'https://github.com/example/repo',
    title: 'Guide',
};

const convert = (markdown: string, overrides: Partial<typeof options & { home: boolean; description: string }> = {}) =>
    markdownToMdx(markdown, { ...options, ...overrides });

describe('markdownToMdx', () => {
    it('escapes braces and angle brackets outside code only', async () => {
        const mdx = convert('# Guide\n\nSend {id} to <host>, or `{literal}` and ``<tag>``.\n');

        expect(mdx).toContain('Send \\{id\\} to \\<host>, or `{literal}` and ``<tag>``.');
        await expect(compile(mdx)).resolves.toBeDefined();
    });

    it('leaves fenced code untouched, including template syntax', async () => {
        const mdx = convert('# Guide\n\n```http\nGET {{ _.base_url }}/a <b>\n```\n\n~~~\n{x}\n~~~\n');

        expect(mdx).toContain('GET {{ _.base_url }}/a <b>');
        expect(mdx).toContain('~~~\n{x}\n~~~');
        await expect(compile(mdx)).resolves.toBeDefined();
    });

    it('makes the paragraph after the heading the lead, and only that one', () => {
        const mdx = convert('# Guide\n\nFirst line\nsecond line.\n\nNext paragraph.\n');

        expect(mdx).toContain("second line. {{ className: 'lead' }}");
        expect(mdx.match(/className: 'lead'/g)).toHaveLength(1);
    });

    it('adds no lead when a heading, list or table follows the title', () => {
        expect(convert('# Guide\n\n## Section\n\nText.\n')).not.toContain('lead');
        expect(convert('# Guide\n\n> Note\n\nText.\n')).not.toContain('lead');
    });

    it('titles the page from the options and describes it from the first paragraph', () => {
        const mdx = convert('# Guide\n\n## Section\n\nFirst **bold** and `code` and [a link](x.md). More.\n');

        expect(mdx).toContain('title: "Guide"');
        expect(mdx).toContain('description: "First bold and code and a link. More."');
        expect(convert('# Guide\n\nText.\n', { description: 'Given.' })).toContain('description: "Given."');
    });

    it('resolves relative links: published pages to their href, other files to GitHub', () => {
        const mdx = convert(
            '# Guide\n\n[a](OTHER.md#part), [b](../src/index.ts), [c](https://x.dev/y), [d](#here), [e](INTRODUCTION.md)\n',
        );

        expect(mdx).toContain('[a](/other#part)');
        expect(mdx).toContain('[b](https://github.com/example/repo/blob/main/src/index.ts)');
        expect(mdx).toContain('[c](https://x.dev/y), [d](#here), [e](/)');
    });

    it('shows the Guides and Resources cards after the heading and its lead on the home page', async () => {
        const mdx = convert('# Introduction\n\nLead text.\n\n## First\n\nBody.\n', { home: true });

        expect(mdx.indexOf('<HeroPattern />')).toBeLessThan(mdx.indexOf('# Introduction'));
        expect(mdx.indexOf('Lead text.')).toBeLessThan(mdx.indexOf('<Guides />'));
        expect(mdx.indexOf('<Resources />')).toBeLessThan(mdx.indexOf('## First'));
        expect(mdx.startsWith("import { Guides } from '@/components/Guides'")).toBe(true);
        await expect(compile(mdx)).resolves.toBeDefined();
    });

    it('puts the cards straight after the heading when there is no lead', () => {
        const mdx = convert('# Introduction\n\n## First\n\nBody.\n', { home: true });

        expect(mdx.indexOf('<Guides />')).toBeLessThan(mdx.indexOf('## First'));
    });

    it('rejects what MDX cannot take, naming the line', () => {
        expect(() => convert('# Guide\n\ntext\n<!-- note -->\n')).toThrow('docs/GUIDE.md:4');
        expect(() => convert('# Guide\n\n<!-- note -->\n')).toThrow(UnsupportedError);
        expect(() => convert('text only\n')).toThrow('expected a level 1 heading');
        expect(() => convert('# Guide\n\n```sh\nnever closed\n')).toThrow('never closed');
    });
});
