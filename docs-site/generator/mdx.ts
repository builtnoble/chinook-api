import type { Code, Heading, Html, Paragraph, PhrasingContent, Root, RootContent, Text, ThematicBreak } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { type MdxJsxFlowElement, type MdxjsEsm, type MdxTextExpression, mdxToMarkdown } from 'mdast-util-mdx';
import { toMarkdown } from 'mdast-util-to-markdown';
import { mdxMd } from 'micromark-extension-mdx-md';
import { UnsupportedError } from './schema';

// What sits on a line of its own, in a page or inside an element.
export type Block = MdxJsxFlowElement['children'][number];

// An element written as a block, such as `<Col>`, with its attributes in order.
// A `true` attribute is written bare.
export const jsx = (
    name: string,
    attributes: Record<string, string | true>,
    children: Block[] = [],
): MdxJsxFlowElement => ({
    type: 'mdxJsxFlowElement',
    name,
    attributes: Object.entries(attributes).map(([attribute, value]) => ({
        type: 'mdxJsxAttribute',
        name: attribute,
        value: value === true ? null : value,
    })),
    children,
});

// The object the theme reads from a heading or a paragraph, such as
// `{{ tag: 'GET', label: '/albums' }}`.
export const directive = (properties: Record<string, string>): MdxTextExpression => ({
    type: 'mdxTextExpression',
    value: `{ ${Object.entries(properties)
        .map(([key, value]) => `${key}: '${value}'`)
        .join(', ')} }`,
});

// A description is a line of Markdown. It is read as MDX reads Markdown, with
// `{` and `<` as plain text, so the serializer escapes them.
export const phrasing = (text: string, where: string): PhrasingContent[] => {
    const { children } = fromMarkdown(text.replace(/\s+/g, ' ').trim(), { extensions: [mdxMd()] });
    if (children.length > 1 || (children[0] && children[0].type !== 'paragraph')) {
        throw new UnsupportedError(`${where}: a description must be a single paragraph`);
    }

    return children[0]?.children ?? [];
};

export const text = (value: string): Text => ({ type: 'text', value });

export const heading = (depth: Heading['depth'], children: PhrasingContent[] | string): Heading => ({
    type: 'heading',
    depth,
    children: typeof children === 'string' ? [text(children)] : children,
});

export const paragraph = (children: PhrasingContent[] | string): Paragraph => ({
    type: 'paragraph',
    children: typeof children === 'string' ? [text(children)] : children,
});

export const rule: ThematicBreak = { type: 'thematicBreak' };

// The theme reads a title from the fence's meta, as in
// ```bash {{ title: 'cURL' }}.
export const fence = (lang: string, title: string | undefined, value: string): Code => ({
    type: 'code',
    lang,
    meta: title ? `{{ title: '${title}' }}` : null,
    value,
});

// A character reference, which text would escape.
export const entity = (value: string): Html => ({ type: 'html', value });

// The `export const metadata = ...` that opens a page.
export const esm = (value: string): MdxjsEsm => ({ type: 'mdxjsEsm', value });

export const mdx = (children: RootContent[]): string =>
    toMarkdown({ type: 'root', children } satisfies Root, { extensions: [mdxToMarkdown()], rule: '-' });
