// Regenerates the docs pages whenever their sources change, for `bun run preview`. The dev server watching the output
// directory does the rest, so an edit to docs/ shows up in the open browser tab without restarting anything.
//
//   bun scripts/watch.ts <out-dir> <spec-path>
import { watch } from 'node:fs';
import { join, resolve } from 'node:path';

const [out, spec] = process.argv.slice(2);
if (!out || !spec) {
    console.error('Usage: bun scripts/watch.ts <out-dir> <spec-path>');
    process.exit(2);
}

const docsSite = resolve(import.meta.dir, '..');
const api = resolve(docsSite, '../api');

// A change to the API source can change the spec, so it re-exports that first. Everything else only regenerates.
const sources = [
    { dir: resolve(docsSite, '../docs'), exportSpec: false },
    { dir: join(docsSite, 'content'), exportSpec: false },
    { dir: join(docsSite, 'generator'), exportSpec: false },
    { dir: join(api, 'src'), exportSpec: true },
];

const isSource = (file: string) => !/\.test\.ts$|(^|\/)(fixtures|__snapshots__)(\/|$)/.test(file);

const run = (cmd: string[], cwd: string) => Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' }).exited;

let pending: { exportSpec: boolean } | undefined;
let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;

const regenerate = async () => {
    if (running || !pending) return;
    const { exportSpec } = pending;
    pending = undefined;
    running = true;

    // A failed step is already reported by the command, and the dev server keeps serving the last good pages.
    const exported = !exportSpec || (await run(['bun', 'run', 'openapi:export', resolve(spec)], api)) === 0;
    if (exported) {
        await run(
            ['bun', 'generator/index.ts', '--spec', resolve(spec), '--pages', 'content/pages.json', '--out', out],
            docsSite,
        );
    }

    running = false;
    // Edits that arrived while this ran are handled once, now.
    void regenerate();
};

for (const { dir, exportSpec } of sources) {
    watch(dir, { recursive: true }, (_event, file) => {
        if (file && !isSource(String(file))) return;

        pending = { exportSpec: exportSpec || (pending?.exportSpec ?? false) };
        clearTimeout(timer);
        timer = setTimeout(regenerate, 150);
    });
}

console.log('Watching docs/, docs-site/content, docs-site/generator and api/src for changes.');
