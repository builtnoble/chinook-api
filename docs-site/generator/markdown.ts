import { posix } from 'node:path';
import { UnsupportedError } from './schema';

export type MarkdownOptions = {
    // Repo-relative path of the file, so its relative links can be resolved.
    path: string;
    // Repo-relative paths of the other published files, mapped to the site href of their page.
    published: Map<string, string>;
    // GitHub URL of the repository, which links to files that are not published point at.
    repository: string;
    title: string;
    description?: string;
    // The home page also ends with the Guides and Resources cards.
    home?: boolean;
};

const ESCAPED = /[{}<]/g;

// Splits a line into code spans, which MDX reads literally, and the text between them.
const splitCodeSpans = (line: string): { text: string; code: boolean }[] => {
    const parts: { text: string; code: boolean }[] = [];
    let start = 0;
    let index = 0;

    while (index < line.length) {
        if (line[index] !== '`') {
            index++;
            continue;
        }

        let open = index;
        while (line[open] === '`') open++;
        const marker = line.slice(index, open);

        let close = open;
        let end = -1;
        while (close < line.length) {
            const next = line.indexOf(marker, close);
            if (next === -1) break;

            let after = next + marker.length;
            while (line[after] === '`') after++;
            if (after - next === marker.length) {
                end = after;
                break;
            }
            close = after;
        }

        if (end === -1) {
            index = open;
            continue;
        }

        if (index > start) parts.push({ text: line.slice(start, index), code: false });
        parts.push({ text: line.slice(index, end), code: true });
        start = index = end;
    }

    if (start < line.length) parts.push({ text: line.slice(start), code: false });
    return parts;
};

const resolveLink = (destination: string, options: MarkdownOptions): string => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(destination)) return destination;

    const [target, hash] = destination.split('#');
    const resolved = posix.normalize(posix.join(posix.dirname(options.path), target || posix.basename(options.path)));
    const page = options.published.get(resolved);

    if (page !== undefined) return hash ? `${page}#${hash}` : page;
    return `${options.repository}/blob/main/${resolved}${hash ? `#${hash}` : ''}`;
};

const convertInline = (line: string, options: MarkdownOptions, where: string): string =>
    splitCodeSpans(line)
        .map(({ text, code }) => {
            if (code) return text;
            if (text.includes('<!--')) {
                throw new UnsupportedError(`${where}: HTML comments are not valid MDX, so remove or reword it`);
            }

            return text
                .replace(/\]\(([^)\s]+)/g, (_, destination: string) => `](${resolveLink(destination, options)}`)
                .replace(ESCAPED, (character) => `\\${character}`);
        })
        .join('');

const plainText = (markdown: string) =>
    markdown
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[`*_]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

const sentenceStart = (text: string, limit = 200) => {
    if (text.length <= limit) return text;

    const sentence = text.slice(0, limit).match(/^.*[.!?](?=\s)/);
    return sentence ? sentence[0] : `${text.slice(0, limit - 1).trimEnd()}…`;
};

// A paragraph, as opposed to a heading, list, table, quote or HTML.
const isParagraph = (line: string) => !/^(#|>|[-*+] |\d+[.)] |\||<|\s*$)/.test(line);

// The first run of paragraph lines after the heading, outside code fences.
const firstParagraph = (lines: string[]): string => {
    const found: string[] = [];
    let fenced = false;
    let afterHeading = false;

    for (const line of lines) {
        if (/^\s*(`{3,}|~{3,})/.test(line)) fenced = !fenced;
        else if (fenced) continue;
        else if (!afterHeading) afterHeading = /^# /.test(line);
        else if (isParagraph(line)) found.push(line);
        else if (found.length) break;
    }

    return found.join(' ');
};

// Converts a repository Markdown file into an MDX page for the Protocol theme, so the Markdown stays the only
// copy: `{`, `}` and `<` are escaped outside code, relative links are resolved, and the first paragraph after
// the heading becomes the page's lead.
export const markdownToMdx = (source: string, options: MarkdownOptions): string => {
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const body: string[] = [];
    let fence: { marker: string; length: number } | undefined;
    let heading = false;
    let lead: 'waiting' | 'open' | 'done' = 'waiting';

    lines.forEach((line, index) => {
        const where = `${options.path}:${index + 1}`;

        if (fence) {
            body.push(line);
            const closing = line.trim().match(/^(`{3,}|~{3,})\s*$/);
            if (closing && closing[1][0] === fence.marker && closing[1].length >= fence.length) fence = undefined;
            return;
        }

        const opening = line.match(/^\s*(`{3,}|~{3,})/);
        if (opening) {
            fence = { marker: opening[1][0], length: opening[1].length };
            body.push(line);
            if (lead === 'waiting' && heading) lead = 'done';
            return;
        }

        if (!heading && /^# /.test(line)) {
            heading = true;
            body.push(convertInline(line, options, where));
            return;
        }

        let converted = convertInline(line, options, where);

        if (heading && lead === 'waiting' && line.trim() !== '') {
            lead = isParagraph(line) ? 'open' : 'done';
        }

        if (lead === 'open' && (lines[index + 1] === undefined || lines[index + 1].trim() === '')) {
            converted += " {{ className: 'lead' }}";
            lead = 'done';
            body.push(converted);
            return;
        }

        body.push(converted);
    });

    if (!heading) {
        throw new UnsupportedError(`${options.path}: expected a level 1 heading`);
    }
    if (fence) {
        throw new UnsupportedError(`${options.path}: a code fence is never closed`);
    }

    if (options.home) {
        // The source ends with a newline, which would leave two blank lines before the cards.
        while (body.at(-1) === '') body.pop();
        body.push('', '<Guides />', '', '<Resources />');
    }

    const description = options.description ?? sentenceStart(plainText(firstParagraph(lines)));
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

    return `${[...top, ...body].join('\n').replace(/\n+$/, '')}\n`;
};
