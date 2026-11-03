// Writes the OpenAPI document to disk without a database or a running server,
// so docs can be generated from it at build time.
// Usage: bun [--watch] scripts/export-openapi.ts [outFile]
const outFile = process.argv[2] ?? 'openapi.json';

const { default: app } = await import('@/index');

const response = await app.fetch(new Request('http://localhost/openapi.json'));

if (response.ok) {
    await Bun.write(outFile, `${JSON.stringify(await response.json(), null, 2)}\n`);
    console.log(`Wrote ${outFile}`);
} else {
    console.error(`GET /openapi.json returned ${response.status}`);
    process.exitCode = 1;
}

// Importing the app leaves handles open, so the script ends itself. Under
// `bun --watch` an exit would also end the watcher, which has to stay alive to
// run the script again.
if (!process.execArgv.includes('--watch')) {
    process.exit();
}

// Makes this file a module, which top-level await needs.
export {};
