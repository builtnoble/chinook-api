import { describe, expect, it } from 'bun:test';
import { compile } from '@mdx-js/mdx';
import { loadPages } from './index';

// The published pages are generated from the Markdown in docs/, so a Markdown change that MDX cannot compile has to
// fail here and not when the site is built.
describe('the published documents', () => {
    it('convert to MDX that compiles', async () => {
        const pages = await loadPages(new URL('../content/pages.json', import.meta.url).pathname);
        const sources = [pages.introduction, ...(pages.guides ?? []).map((guide) => guide.source)];

        expect(sources).toHaveLength(2);
        for (const source of sources) {
            await expect(compile(source as string)).resolves.toBeDefined();
        }
    });

    it('leaves no relative link unresolved in the introduction or the guides', async () => {
        const pages = await loadPages(new URL('../content/pages.json', import.meta.url).pathname);
        const documents = [pages.introduction, ...(pages.guides ?? []).map((guide) => guide.source)];

        for (const mdx of documents) {
            const targets = [...(mdx ?? '').matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);

            // Anchors, site paths and absolute URLs are fine; a relative path would 404 on the site.
            expect(targets.filter((target) => !/^(https?:\/\/|#|\/)/.test(target))).toEqual([]);
        }
    });

    it('keeps the Insomnia guide anchors', async () => {
        const pages = await loadPages(new URL('../content/pages.json', import.meta.url).pathname);

        expect(pages.guides?.[0].source).toContain('](#5-authenticate-requests)');
    });
});
