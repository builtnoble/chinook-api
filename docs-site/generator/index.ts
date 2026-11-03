import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import slugify from '@sindresorhus/slugify';
import type { OpenAPIObject } from 'openapi3-ts/oas31';
import { markdownToMdx } from './markdown';
import { endpointsByTag, renderTagPage } from './render';
import { dereference } from './schema';

export type Guide = {
    title: string;
    href: string;
    description?: string;
    source: string;
};

export type Content = {
    // The home page. It sits above Guides and Resources in the sidebar.
    introduction?: string;
    guides?: Guide[];
};

// Builds every page and returns them as text, keyed by where each one goes in
// the theme. The spec must already have its `$ref`s filled in (see
// `dereference` in schema.ts).
export const generate = (spec: OpenAPIObject, { introduction, guides = [] }: Content = {}): Record<string, string> => {
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

// Writes the pages to `out`, skipping any file that is already up to date, so
// the dev server only reloads the pages that changed. Returns the paths it
// wrote.
export const writeChanged = async (out: string, files: Record<string, string>): Promise<string[]> => {
    const written: string[] = [];

    for (const [path, contents] of Object.entries(files)) {
        const target = Bun.file(join(out, path));
        if ((await target.text().catch(() => undefined)) === contents) continue;

        await Bun.write(target, contents);
        written.push(path);
    }

    return written;
};

// Loads a file with import, so `bun --watch` reruns when the file changes.
const importJson = async <T>(path: string): Promise<T> =>
    (await import(resolve(path), { with: { type: 'json' } })).default;

const importText = async (path: string): Promise<string> =>
    (await import(resolve(path), { with: { type: 'text' } })).default;

type PageEntry = { file: string; title: string; description?: string };

// The list of published Markdown files. File paths are relative to this file.
// `root` is the top of the repository, used to turn links between the documents
// into links between pages.
type Manifest = {
    root: string;
    repository: string;
    introduction?: PageEntry;
    guides: (PageEntry & { href: string })[];
};

// Reads the Markdown files listed in a manifest and turns them into MDX pages.
// The Markdown files themselves are never changed.
export const loadPages = async (manifestPath: string): Promise<Content> => {
    const manifest = await importJson<Manifest>(manifestPath);
    const base = dirname(manifestPath);
    const root = resolve(base, manifest.root);
    const repoPath = (file: string) => relative(root, resolve(base, file)).split('\\').join('/');

    const published = new Map<string, string>();
    if (manifest.introduction) published.set(repoPath(manifest.introduction.file), '/');
    for (const guide of manifest.guides) published.set(repoPath(guide.file), guide.href);

    const convert = async (entry: PageEntry, home: boolean) =>
        markdownToMdx(await importText(resolve(base, entry.file)), {
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
        const spec = await importJson<OpenAPIObject>(values.spec);
        const files = generate(await dereference(spec), values.pages ? await loadPages(values.pages) : {});

        const written = await writeChanged(values.out, files);

        console.log(`Wrote ${written.length} of ${Object.keys(files).length} files to ${values.out}`);
    } catch (error) {
        // Sets the exit code without exiting, so `bun --watch` keeps running.
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
