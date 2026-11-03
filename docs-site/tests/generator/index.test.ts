import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '@mdx-js/mdx';
import { generate, loadPages, writeChanged } from '@/index';
import { contentDir, fixture } from '../support/fixture';

describe('generate', () => {
    it('writes one page per tag plus navigation and metadata', async () => {
        const files = generate(fixture, await loadPages(`${contentDir}/pages.json`));

        expect(Object.keys(files).sort()).toEqual([
            'src/app/albums/page.mdx',
            'src/app/artists/page.mdx',
            'src/app/insomnia/page.mdx',
            'src/app/page.mdx',
            'src/app/playlists/page.mdx',
            'src/generated/meta.json',
            'src/generated/navigation.json',
        ]);
        // The introduction stands alone, outside Guides and Resources.
        expect(JSON.parse(files['src/generated/navigation.json'])).toEqual([
            { links: [{ title: 'Introduction', href: '/' }] },
            {
                title: 'Guides',
                links: [
                    { title: 'Insomnia', href: '/insomnia', description: 'Send your first requests from Insomnia.' },
                ],
            },
            {
                title: 'Resources',
                links: [
                    { title: 'Albums', href: '/albums', description: 'Albums, each with the artist who made it.' },
                    { title: 'Artists', href: '/artists', description: 'Artists who have made albums.' },
                    { title: 'Playlists', href: '/playlists', description: 'Named playlists.' },
                ],
            },
        ]);
        expect(JSON.parse(files['src/generated/meta.json'])).toEqual({
            title: 'Chinook',
            version: '1.0.0',
            baseUrl: 'http://localhost:3000',
        });
    });

    it('leaves the introduction out of the navigation when there is none', () => {
        const navigation = JSON.parse(generate(fixture)['src/generated/navigation.json']);

        expect(navigation.map((group: { title?: string }) => group.title)).toEqual(['Guides', 'Resources']);
    });

    it('matches the recorded pages', () => {
        const files = generate(fixture);

        expect(files['src/app/albums/page.mdx']).toMatchSnapshot();
        expect(files['src/app/artists/page.mdx']).toMatchSnapshot();
        expect(files['src/app/playlists/page.mdx']).toMatchSnapshot();
    });

    it('is deterministic', () => {
        expect(generate(fixture)).toEqual(generate(structuredClone(fixture)));
    });

    it('produces pages that compile as MDX', async () => {
        for (const [path, contents] of Object.entries(generate(fixture))) {
            if (path.endsWith('.mdx')) {
                await expect(compile(contents)).resolves.toBeDefined();
            }
        }
    });

    it('documents what the by-id route returns, from the model on the same page', () => {
        const page = generate(fixture)['src/app/albums/page.mdx'];

        expect(page).toContain("## Retrieve an album {{ tag: 'GET', label: '/api/albums/:id' }}");
        expect(page).toContain('See [the album model](#the-album-model).');
        expect(page).toContain('"prev_page_url": null');
        expect(page).toContain('type="string | null"');
    });
});

describe('writeChanged', () => {
    const folders: string[] = [];
    const folder = () => {
        const path = mkdtempSync(join(tmpdir(), 'pages-'));
        folders.push(path);

        return path;
    };

    afterEach(() => {
        for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true });
    });

    it('writes new files, creating their folders', async () => {
        const out = folder();

        expect(await writeChanged(out, { 'a.mdx': 'one', 'src/app/b/page.mdx': 'two' })).toEqual([
            'a.mdx',
            'src/app/b/page.mdx',
        ]);
        expect(await Bun.file(join(out, 'src/app/b/page.mdx')).text()).toBe('two');
    });

    it('leaves a file whose contents match alone, and writes the one that changed', async () => {
        const out = folder();
        await writeChanged(out, { 'a.mdx': 'one', 'b.mdx': 'two' });
        const before = Bun.file(join(out, 'a.mdx')).lastModified;
        await Bun.sleep(20);

        expect(await writeChanged(out, { 'a.mdx': 'one', 'b.mdx': 'changed' })).toEqual(['b.mdx']);
        expect(Bun.file(join(out, 'a.mdx')).lastModified).toBe(before);
        expect(await Bun.file(join(out, 'b.mdx')).text()).toBe('changed');
    });
});
