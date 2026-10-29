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

    it('link the introduction and the guide to each other and to the repository', async () => {
        const pages = await loadPages(new URL('../content/pages.json', import.meta.url).pathname);

        expect(pages.introduction).toContain(
            'https://github.com/builtnoble/chinook-api/blob/main/api/src/db/schema.ts',
        );
        expect(pages.guides?.[0].source).toContain('](#5-authenticate-requests)');
    });
});
