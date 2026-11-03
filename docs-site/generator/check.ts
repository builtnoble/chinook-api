// Builds every page from an exported spec and the published documents, then
// compiles each one as MDX. This catches a change to the API or to docs/ that
// would break the site, without needing the private theme.
// Usage: bun generator/check.ts <openapi.json>
import { compile } from '@mdx-js/mdx';
import type { OpenAPIObject } from 'openapi3-ts/oas31';
import { generate, loadPages } from './index';
import { dereference } from './schema';

const specPath = Bun.argv[2];
if (!specPath) {
    console.error('Usage: bun generator/check.ts <openapi.json>');
    process.exit(2);
}

try {
    const spec = (await Bun.file(specPath).json()) as OpenAPIObject;
    const files = generate(
        await dereference(spec),
        await loadPages(new URL('../content/pages.json', import.meta.url).pathname),
    );

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
