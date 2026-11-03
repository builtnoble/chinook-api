import { describe, expect, it } from 'bun:test';
import { compile } from '@mdx-js/mdx';
import { markdownToMdx } from '@/markdown';
import { UnsupportedError } from '@/schema';

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

    it('ends the home page with the Guides and Resources cards', async () => {
        const mdx = convert('# Introduction\n\nLead text.\n\n## First\n\nBody.\n', { home: true });

        expect(mdx.indexOf('<HeroPattern />')).toBeLessThan(mdx.indexOf('# Introduction'));
        expect(mdx.indexOf('Body.')).toBeLessThan(mdx.indexOf('<Guides />'));
        expect(mdx.indexOf('<Guides />')).toBeLessThan(mdx.indexOf('<Resources />'));
        expect(mdx).toContain('Body.\n\n<Guides />\n\n<Resources />\n');
        expect(mdx.trimEnd().endsWith('<Resources />')).toBe(true);
        expect(mdx.startsWith("import { Guides } from '@/components/Guides'")).toBe(true);
        await expect(compile(mdx)).resolves.toBeDefined();
    });

    it('still marks the first paragraph after the heading as the lead on the home page', () => {
        const mdx = convert('# Introduction\n\nLead text.\n\n## First\n\nBody.\n', { home: true });

        expect(mdx).toContain("Lead text. {{ className: 'lead' }}");
    });

    it('adds no cards to a guide', () => {
        expect(convert('# Guide\n\ntext\n')).not.toContain('<Guides />');
    });

    it('rejects what MDX cannot take, naming the line', () => {
        expect(() => convert('# Guide\n\ntext\n<!-- note -->\n')).toThrow('docs/GUIDE.md:4');
        expect(() => convert('# Guide\n\n<!-- note -->\n')).toThrow(UnsupportedError);
        expect(() => convert('text only\n')).toThrow('expected a level 1 heading');
        expect(() => convert('# Guide\n\n```sh\nnever closed\n')).toThrow('never closed');
    });

    it('does not escape a brace that is already escaped', () => {
        expect(convert('# Guide\n\nKeep \\{this\\} and escape {that}.\n')).toContain(
            'Keep \\{this\\} and escape \\{that\\}.',
        );
    });

    it('leaves a code span that runs over two lines untouched', async () => {
        const mdx = convert('# Guide\n\nA `code {x}\nacross lines` here {y}.\n');

        expect(mdx).toContain('A `code {x}\nacross lines` here \\{y\\}.');
        await expect(compile(mdx)).resolves.toBeDefined();
    });

    it('escapes indented text, because MDX has no indented code', async () => {
        const mdx = convert('# Guide\n\nText:\n\n    {indented} <b>\n');

        expect(mdx).toContain('    \\{indented\\} \\<b>');
        await expect(compile(mdx)).resolves.toBeDefined();
    });

    it('keeps a fence that contains another fence, and a fence inside a list item', async () => {
        const mdx = convert(
            '# Guide\n\n~~~\n```\n{x}\n```\n~~~\n\n1. Run:\n\n    ```sh\n    echo {a} <b>\n    ```\n\n2. Next {c}\n',
        );

        expect(mdx).toContain('~~~\n```\n{x}\n```\n~~~');
        expect(mdx).toContain('    echo {a} <b>');
        expect(mdx).toContain('2. Next \\{c\\}');
        await expect(compile(mdx)).resolves.toBeDefined();
    });

    it('resolves the destination of a reference-style link', () => {
        const mdx = convert('# Guide\n\nSee [the other][o].\n\n[o]: OTHER.md#part\n');

        expect(mdx).toContain('[o]: /other#part');
    });

    it('resolves a link with a title, and an image', () => {
        const mdx = convert('# Guide\n\n[a](OTHER.md "the title") and ![img](./pic.png)\n');

        expect(mdx).toContain('[a](/other "the title")');
        expect(mdx).toContain('![img](https://github.com/example/repo/blob/main/docs/pic.png)');
    });

    it('makes no lead of a table, a quote, or a paragraph that starts with HTML', () => {
        expect(convert('# Guide\n\n| a | b |\n| - | - |\n| 1 | 2 |\n')).not.toContain('lead');
        expect(convert('# Guide\n\n> quote\n')).not.toContain('lead');
        expect(convert('# Guide\n\n<div>\ntext\n</div>\n')).not.toContain('lead');
    });

    it('describes the page from the first paragraph of prose, with the alt text of an image', () => {
        const mdx = convert('# Guide\n\n![One](a.svg) ![Two](b.svg)\n\nText.\n');

        expect(mdx).toContain('description: "One Two"');
        expect(convert('# Guide\n\n<div>\nhtml\n</div>\n\nProse.\n')).toContain('description: "Prose."');
    });

    it('takes a title underlined with =', () => {
        expect(convert('Guide\n=====\n\nLead.\n')).toContain("Lead. {{ className: 'lead' }}");
    });

    it('converts CRLF line endings and a file with no final newline', () => {
        expect(convert('# Guide\r\n\r\nLead {x}.')).toContain("Lead \\{x\\}. {{ className: 'lead' }}\n");
    });

    it('reports an HTML comment in a heading or in link text, but not in a code span', () => {
        expect(() => convert('# Guide\n\n## Part <!-- x -->\n')).toThrow('docs/GUIDE.md:3');
        expect(() => convert('# Guide\n\n[a <!-- x --> b](OTHER.md)\n')).toThrow('docs/GUIDE.md:3');
        expect(() => convert('# Guide\n\nWrite `<!-- x -->` literally.\n')).not.toThrow();
    });

    it('rejects a fence that is never closed inside a list item', () => {
        expect(() => convert('# Guide\n\n- item\n\n  ```sh\n  never closed\n')).toThrow('never closed');
    });
});
