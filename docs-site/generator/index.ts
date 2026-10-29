import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { endpointsByTag, renderTagPage, slugify } from './render';
import type { Guide, Spec } from './types';

type GuideIndexEntry = { title: string; href: string; description?: string; file: string };

type Content = {
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

export const readGuides = async (dir: string): Promise<Guide[]> => {
    const index = JSON.parse(await readFile(join(dir, 'guides.json'), 'utf8')) as GuideIndexEntry[];

    return Promise.all(
        index.map(async ({ file, ...entry }) => ({ ...entry, source: await readFile(join(dir, file), 'utf8') })),
    );
};

if (import.meta.main) {
    const { values } = parseArgs({
        options: {
            spec: { type: 'string' },
            introduction: { type: 'string' },
            guides: { type: 'string' },
            out: { type: 'string' },
        },
    });

    if (!values.spec || !values.out) {
        console.error(
            'Usage: bun generator/index.ts --spec openapi.json --out <dir> [--introduction <file>] [--guides <dir>]',
        );
        process.exit(2);
    }

    try {
        const spec = JSON.parse(await readFile(values.spec, 'utf8')) as Spec;
        const files = generate(spec, {
            introduction: values.introduction ? await readFile(values.introduction, 'utf8') : undefined,
            guides: values.guides ? await readGuides(values.guides) : [],
        });

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
