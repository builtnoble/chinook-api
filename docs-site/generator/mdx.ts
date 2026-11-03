import type { Code, Heading, Html, Paragraph, PhrasingContent, Root, RootContent, Text, ThematicBreak } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { type MdxJsxFlowElement, type MdxjsEsm, type MdxTextExpression, mdxToMarkdown } from 'mdast-util-mdx';
import { toMarkdown } from 'mdast-util-to-markdown';
import { mdxMd } from 'micromark-extension-mdx-md';
import { UnsupportedError } from './schema';

// Anything that sits on its own line, in a page or inside an element.
export type Block = MdxJsxFlowElement['children'][number];

// An element on its own line, such as `<Col>`. Attributes keep the order given,
// and one set to `true` is written without a value.
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

// The small object the theme reads from a heading or paragraph, for example
// `{{ tag: 'GET', label: '/albums' }}`.
export const directive = (properties: Record<string, string>): MdxTextExpression => ({
    type: 'mdxTextExpression',
    value: `{ ${Object.entries(properties)
        .map(([key, value]) => `${key}: '${value}'`)
        .join(', ')} }`,
});

// Turns a one-line description written in Markdown into text, links and code.
// `{` and `<` are treated as plain text and escaped when the page is written.
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

// A code block. The title goes after the language, as in
// ```bash {{ title: 'cURL' }}.
export const fence = (lang: string, title: string | undefined, value: string): Code => ({
    type: 'code',
    lang,
    meta: title ? `{{ title: '${title}' }}` : null,
    value,
});

// An HTML character such as `&nbsp;`, written exactly as given.
export const entity = (value: string): Html => ({ type: 'html', value });

// The `export const metadata = ...` line at the top of a page.
export const esm = (value: string): MdxjsEsm => ({ type: 'mdxjsEsm', value });

export const mdx = (children: RootContent[]): string =>
    toMarkdown({ type: 'root', children } satisfies Root, { extensions: [mdxToMarkdown()], rule: '-' });
