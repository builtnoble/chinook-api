// Renders every page from an exported spec and the published documents, and compiles each as MDX, so a change to
// the API or to docs/ that the site could not build fails in CI without needing the private theme.
// Usage: bun generator/check.ts <openapi.json>
import { readFile } from 'node:fs/promises';
import { compile } from '@mdx-js/mdx';
import { generate, loadPages } from './index';
import type { Spec } from './types';

const specPath = process.argv[2];
if (!specPath) {
    console.error('Usage: bun generator/check.ts <openapi.json>');
    process.exit(2);
}

try {
    const spec = JSON.parse(await readFile(specPath, 'utf8')) as Spec;
    const files = generate(spec, await loadPages(new URL('../content/pages.json', import.meta.url).pathname));

    const pages = Object.entries(files).filter(([path]) => path.endsWith('.mdx'));
    for (const [path, source] of pages) {
        await compile(source).catch((error: Error) => {
            throw new Error(`${path}: ${error.message}`);
        });
    }

    console.log(`Compiled ${pages.length} pages from ${specPath}`);
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}
