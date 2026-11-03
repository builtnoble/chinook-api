import { posix } from 'node:path';
import type { Definition, Image, Link, Nodes, Paragraph, Root } from 'mdast';
import { mdxMd } from 'micromark-extension-mdx-md';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { UnsupportedError } from './schema';

export type MarkdownOptions = {
    // Path of the file from the top of the repository, used to work out its
    // relative links.
    path: string;
    // Paths of the other published files, each mapped to the page it becomes.
    published: Map<string, string>;
    // GitHub address of the repository. Links to files that are not published
    // point here.
    repository: string;
    title: string;
    description?: string;
    // The home page also ends with the Guides and Resources cards.
    home?: boolean;
};

// Markdown is read the way MDX reads it (no indented code, automatic links or
// HTML), plus the tables the theme supports.
const processor = unified().use(remarkParse).use(remarkGfm).data('micromarkExtensions', [mdxMd()]);

const parse = (source: string): Root => processor.parse(source);

// A change to the text: remove some characters at a position, then insert new
// text.
type Edit = { at: number; remove: number; insert: string };

const applyEdits = (source: string, edits: Edit[]): string =>
    [...edits]
        .sort((a, b) => b.at - a.at)
        .reduce((text, { at, remove, insert }) => text.slice(0, at) + insert + text.slice(at + remove), source);

// Where a node starts and ends in the text. Nodes parsed from a string always
// have this.
const span = (node: Nodes): [number, number] => [node.position?.start.offset ?? 0, node.position?.end.offset ?? 0];

const lineOf = (node: Nodes) => node.position?.start.line ?? 1;

const resolveLink = (destination: string, options: MarkdownOptions): string => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(destination)) return destination;

    const [target, hash] = destination.split('#');
    const resolved = posix.normalize(posix.join(posix.dirname(options.path), target || posix.basename(options.path)));
    const page = options.published.get(resolved);

    if (page !== undefined) return hash ? `${page}#${hash}` : page;
    return `${options.repository}/blob/main/${resolved}${hash ? `#${hash}` : ''}`;
};

// A code block that is never closed. The parser allows it, but it would swallow
// the rest of the page.
const isUnclosedFence = (raw: string): boolean => {
    const lines = raw.split('\n');
    const opening = lines[0].match(/^(`{3,}|~{3,})/);
    const closing =
        lines.length > 1
            ? lines
                  .at(-1)
                  ?.replace(/^[\s>]*/, '')
                  .match(/^(`{3,}|~{3,})\s*$/)
            : null;

    return (
        Boolean(opening) && !(closing && closing[1][0] === opening?.[1][0] && closing[1].length >= opening[1].length)
    );
};

// The text a reader sees, without the Markdown around it. An image counts as
// its alt text.
const textOf = (node: Nodes): string => {
    let text = '';

    visit(node, (child) => {
        if (child.type === 'text' || child.type === 'inlineCode') text += child.value;
        else if (child.type === 'image') text += child.alt ?? '';
    });

    return text.replace(/\s+/g, ' ').trim();
};

const sentenceStart = (text: string, limit = 200) => {
    if (text.length <= limit) return text;

    const sentence = text.slice(0, limit).match(/^.*[.!?](?=\s)/);
    return sentence ? sentence[0] : `${text.slice(0, limit - 1).trimEnd()}…`;
};

// An error for something MDX cannot handle, with the line number in the
// Markdown.
const check = (tree: Root, source: string, options: MarkdownOptions) => {
    visit(tree, 'text', (node) => {
        const index = node.value.indexOf('<!--');
        if (index === -1) return;

        const line = lineOf(node) + node.value.slice(0, index).split('\n').length - 1;
        throw new UnsupportedError(`${options.path}:${line}: HTML comments are not valid MDX, so remove or reword it`);
    });

    if (!tree.children.some((node) => node.type === 'heading' && node.depth === 1)) {
        throw new UnsupportedError(`${options.path}: expected a level 1 heading`);
    }

    visit(tree, 'code', (node) => {
        if (isUnclosedFence(source.slice(...span(node)))) {
            throw new UnsupportedError(`${options.path}: a code fence is never closed`);
        }
    });
};

// Where the address of a link, image or definition sits in the text. `null`
// when there is nothing to change: a link the parser found in plain text, or an
// empty address.
const destinationOf = (node: Link | Image | Definition, source: string): [number, number] | null | undefined => {
    const [start, end] = span(node);
    const raw = source.slice(start, end);

    if (node.type === 'definition') {
        const match = raw.match(/^\[(?:\\.|[^\]\\])*\]:\s*(<[^>\n]*>|\S+)/);
        return match ? [start + match[0].length - match[1].length, start + match[0].length] : undefined;
    }

    if (!raw.startsWith('[') && !raw.startsWith('![')) return null;

    // A link's label ends where its last child ends. An image has no children.
    const lastChild = node.type === 'link' ? node.children.at(-1) : undefined;
    const close = raw.indexOf('](', lastChild ? span(lastChild)[1] - start : 1);
    if (close === -1) return undefined;

    const rest = raw.slice(close + 2);
    const match = rest.match(/^\s*(<[^>\n]*>|[^\s)]+)/);
    if (!match) return rest.trimStart().startsWith(')') ? null : undefined;

    const from = start + close + 2 + match[0].length - match[1].length;
    return [from, from + match[1].length];
};

const rewriteLinks = (tree: Root, source: string, options: MarkdownOptions): string => {
    const edits: Edit[] = [];

    visit(tree, (node) => {
        if (node.type !== 'link' && node.type !== 'image' && node.type !== 'definition') return;

        const range = destinationOf(node, source);
        if (range === null) return;
        if (range === undefined) {
            throw new UnsupportedError(`${options.path}:${lineOf(node)}: cannot tell where this link points`);
        }

        const raw = source.slice(...range);
        const angled = raw.startsWith('<');
        const destination = angled ? raw.slice(1, -1) : raw;
        const resolved = resolveLink(destination, options);

        if (resolved !== destination) {
            edits.push({ at: range[0], remove: raw.length, insert: angled ? `<${resolved}>` : resolved });
        }
    });

    return applyEdits(source, edits);
};

// The positions of `{`, `}` and `<` that MDX would treat as code: every one
// outside code blocks and inline code, unless a backslash is already in front.
const escapes = (tree: Root, source: string): Edit[] => {
    const code: [number, number][] = [];
    const edits: Edit[] = [];

    visit(tree, (node) => {
        if (node.type === 'code' || node.type === 'inlineCode') code.push(span(node));
    });

    let next = 0;
    for (let index = 0; index < source.length; index++) {
        while (next < code.length && code[next][1] <= index) next++;
        if (next < code.length && code[next][0] <= index) {
            index = code[next][1] - 1;
            continue;
        }

        if (!'{}<'.includes(source[index])) continue;

        let backslashes = 0;
        while (source[index - 1 - backslashes] === '\\') backslashes++;
        if (backslashes % 2 === 0) edits.push({ at: index, remove: 0, insert: '\\' });
    }

    return edits;
};

// A normal paragraph, as opposed to one that starts with HTML.
const isProse = (node: Nodes | undefined, source: string): node is Paragraph =>
    node?.type === 'paragraph' && source[span(node)[0]] !== '<';

// The paragraph right after the title is the page's lead. The first paragraph
// anywhere after it is used as the page description.
const afterTitle = (tree: Root): Nodes[] => {
    const title = tree.children.findIndex((node) => node.type === 'heading' && node.depth === 1);

    return tree.children.slice(title + 1);
};

// Turns a Markdown file from the repository into an MDX page for the theme. The
// Markdown stays the only copy: `{`, `}` and `<` are escaped outside code,
// relative links are fixed, and the first paragraph after the heading becomes
// the page's lead.
export const markdownToMdx = (source: string, options: MarkdownOptions): string => {
    const text = source.replace(/\r\n/g, '\n');
    const original = parse(text);

    check(original, text, options);

    const first = afterTitle(original).find((node) => isProse(node, text));
    const description = options.description ?? sentenceStart(first ? textOf(first) : '');

    const linked = rewriteLinks(original, text, options);
    const tree = parse(linked);
    const lead = afterTitle(tree)[0];
    const edits = escapes(tree, linked);

    if (isProse(lead, linked)) edits.push({ at: span(lead)[1], remove: 0, insert: " {{ className: 'lead' }}" });

    let body = applyEdits(linked, edits).replace(/\n+$/, '');

    if (options.home) body += '\n\n<Guides />\n\n<Resources />';

    const top = [
        ...(options.home
            ? [
                  "import { Guides } from '@/components/Guides'",
                  "import { HeroPattern } from '@/components/HeroPattern'",
                  "import { Resources } from '@/components/Resources'",
                  '',
              ]
            : []),
        'export const metadata = {',
        `  title: ${JSON.stringify(options.title)},`,
        `  description: ${JSON.stringify(description)},`,
        '}',
        '',
        ...(options.home ? ['<HeroPattern />', ''] : []),
    ];

    return `${[...top, body].join('\n').replace(/\n+$/, '')}\n`;
};
