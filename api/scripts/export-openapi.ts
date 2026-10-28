// Writes the OpenAPI document to disk without a database or a running server,
// so docs can be generated from it at build time. Usage: bun scripts/export-openapi.ts [outFile]
const outFile = process.argv[2] ?? 'openapi.json';

const { default: app } = await import('@/index');

const response = await app.fetch(new Request('http://localhost/openapi.json'));
if (!response.ok) {
    console.error(`GET /openapi.json returned ${response.status}`);
    process.exit(1);
}

await Bun.write(outFile, `${JSON.stringify(await response.json(), null, 2)}\n`);
console.log(`Wrote ${outFile}`);
process.exit(0);
