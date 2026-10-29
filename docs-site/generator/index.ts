import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { markdownToMdx } from './markdown';
import { endpointsByTag, renderTagPage, slugify } from './render';
import type { Guide, Spec } from './types';

export type Content = {
    // The home page, shown in the sidebar outside Guides and Resources.
    introduction?: string;
    guides?: Guide[];
};

// Maps each output path (relative to the theme root) to its contents. Pure, so tests can call it directly.
export const generate = (spec: Spec, { introduction, guides = [] }: Content = {}): Record<string, string> => {
    const baseUrl = spec.servers?.[0]?.url ?? '';
    const files: Record<string, string> = {};

    if (introduction !== undefined) {
        files['src/app/page.mdx'] = introduction;
    }

    for (const guide of guides) {
        files[`src/app${guide.href}/page.mdx`] = guide.source;
    }

    const resources = [];
    for (const [tag, endpoints] of endpointsByTag(spec)) {
        const slug = slugify(tag);
        files[`src/app/${slug}/page.mdx`] = renderTagPage(spec, tag, endpoints, baseUrl);
        resources.push({
            title: tag,
            href: `/${slug}`,
            description: spec.tags?.find((candidate) => candidate.name === tag)?.description,
        });
    }

    files['src/generated/navigation.json'] = json([
        ...(introduction !== undefined ? [{ links: [{ title: 'Introduction', href: '/' }] }] : []),
        { title: 'Guides', links: guides.map(({ title, href, description }) => ({ title, href, description })) },
        { title: 'Resources', links: resources },
    ]);
    files['src/generated/meta.json'] = json({
        title: spec.info.title,
        version: spec.info.version,
        baseUrl,
    });

    return files;
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

type PageEntry = { file: string; title: string; description?: string };

// Where the published Markdown lives. Paths are relative to this file, and `root` is the repository root, so that
// relative links between the documents can be resolved.
type Manifest = {
    root: string;
    repository: string;
    introduction?: PageEntry;
    guides: (PageEntry & { href: string })[];
};

// Reads the Markdown files a manifest lists and converts them to MDX. The Markdown files stay the only copy.
export const loadPages = async (manifestPath: string): Promise<Content> => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
    const base = dirname(manifestPath);
    const root = resolve(base, manifest.root);
    const repoPath = (file: string) => relative(root, resolve(base, file)).split('\\').join('/');

    const published = new Map<string, string>();
    if (manifest.introduction) published.set(repoPath(manifest.introduction.file), '/');
    for (const guide of manifest.guides) published.set(repoPath(guide.file), guide.href);

    const convert = async (entry: PageEntry, home: boolean) =>
        markdownToMdx(await readFile(resolve(base, entry.file), 'utf8'), {
            path: repoPath(entry.file),
            published,
            repository: manifest.repository,
            title: entry.title,
            description: entry.description,
            home,
        });

    return {
        introduction: manifest.introduction ? await convert(manifest.introduction, true) : undefined,
        guides: await Promise.all(
            manifest.guides.map(async (guide) => ({
                title: guide.title,
                href: guide.href,
                description: guide.description,
                source: await convert(guide, false),
            })),
        ),
    };
};

if (import.meta.main) {
    const { values } = parseArgs({
        options: { spec: { type: 'string' }, pages: { type: 'string' }, out: { type: 'string' } },
    });

    if (!values.spec || !values.out) {
        console.error('Usage: bun generator/index.ts --spec openapi.json --out <dir> [--pages content/pages.json]');
        process.exit(2);
    }

    try {
        const spec = JSON.parse(await readFile(values.spec, 'utf8')) as Spec;
        const files = generate(spec, values.pages ? await loadPages(values.pages) : {});

        for (const [path, contents] of Object.entries(files)) {
            const target = join(values.out, path);
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, contents);
        }

        console.log(`Wrote ${Object.keys(files).length} files to ${values.out}`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}
