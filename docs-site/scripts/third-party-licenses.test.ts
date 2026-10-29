import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('./third-party-licenses.mjs', import.meta.url).pathname;
const roots: string[] = [];

type Fake = { dir: string; manifest: Record<string, unknown>; license?: string };

// A built site with a source map listing `sources`, and the packages those sources belong to.
const project = (sources: string[], packages: Fake[]) => {
    const root = mkdtempSync(join(tmpdir(), 'licenses-'));
    roots.push(root);

    mkdirSync(join(root, 'out'), { recursive: true });
    writeFileSync(join(root, 'out', 'chunk.js.map'), JSON.stringify({ version: 3, sources }));

    for (const { dir, manifest, license } of packages) {
        mkdirSync(join(root, dir), { recursive: true });
        writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest));
        if (license) writeFileSync(join(root, dir, 'LICENSE'), license);
    }

    return root;
};

const run = (root: string, ...flags: string[]) => {
    const output = join(root, 'notices.txt');
    const result = Bun.spawnSync([process.execPath, script, root, output, ...flags], {
        stderr: 'pipe',
        stdout: 'pipe',
    });

    return {
        code: result.exitCode,
        stderr: result.stderr.toString(),
        text: result.exitCode === 0 ? readFileSync(output, 'utf8') : '',
    };
};

afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const MIT = 'MIT License\n\nCopyright (c) 2020 Someone\n\nPermission is hereby granted...';

describe('third-party-licenses', () => {
    it('lists each bundled package once, with its license text, and ignores the rest', () => {
        const root = project(
            ['webpack://_N_E/./node_modules/alpha/dist/a.js', 'webpack://_N_E/./node_modules/alpha/dist/b.js'],
            [
                {
                    dir: 'node_modules/alpha',
                    manifest: { name: 'alpha', version: '1.0.0', license: 'MIT' },
                    license: MIT,
                },
                {
                    dir: 'node_modules/build-only',
                    manifest: { name: 'build-only', version: '2.0.0', license: 'MPL-2.0' },
                },
            ],
        );
        const { code, text } = run(root);

        expect(code).toBe(0);
        expect(text).toContain('alpha@1.0.0');
        expect(text).toContain('Copyright (c) 2020 Someone');
        expect(text).not.toContain('build-only');
    });

    it('finds scoped and nested packages from their source paths', () => {
        const root = project(
            ['./node_modules/@scope/pkg/index.js', './node_modules/host/node_modules/inner/index.js'],
            [
                {
                    dir: 'node_modules/@scope/pkg',
                    manifest: { name: '@scope/pkg', version: '1.0.0', license: 'ISC' },
                    license: 'ISC text',
                },
                {
                    dir: 'node_modules/host/node_modules/inner',
                    manifest: { name: 'inner', version: '3.0.0', license: 'MIT' },
                    license: MIT,
                },
            ],
        );
        const { code, text } = run(root);

        expect(code).toBe(0);
        expect(text).toContain('@scope/pkg@1.0.0');
        expect(text).toContain('inner@3.0.0');
    });

    it('prints a license text shared by several packages once', () => {
        const root = project(
            ['./node_modules/one/i.js', './node_modules/two/i.js'],
            [
                { dir: 'node_modules/one', manifest: { name: 'one', version: '1.0.0', license: 'MIT' }, license: MIT },
                { dir: 'node_modules/two', manifest: { name: 'two', version: '1.0.0', license: 'MIT' }, license: MIT },
            ],
        );
        const { text } = run(root);

        expect(text).toContain('one@1.0.0');
        expect(text).toContain('two@1.0.0');
        expect(text.match(/Copyright \(c\) 2020 Someone/g)).toHaveLength(1);
    });

    it('notes a package that ships no license file, and expands a GitHub shorthand repository', () => {
        const root = project(
            ['./node_modules/bare/i.js'],
            [
                {
                    dir: 'node_modules/bare',
                    manifest: { name: 'bare', version: '1.0.0', license: 'MIT', repository: 'owner/bare' },
                },
            ],
        );
        const { text } = run(root);

        expect(text).toContain('ships no license file');
        expect(text).toContain('https://github.com/owner/bare');
    });

    it('adds the packages named with --also', () => {
        const root = project(
            ['./node_modules/one/i.js'],
            [
                { dir: 'node_modules/one', manifest: { name: 'one', version: '1.0.0', license: 'MIT' }, license: MIT },
                {
                    dir: 'node_modules/css-framework',
                    manifest: { name: 'css-framework', version: '4.0.0', license: 'MIT' },
                    license: MIT,
                },
            ],
        );

        expect(run(root, '--also', 'css-framework').text).toContain('css-framework@4.0.0');
        expect(run(root).text).not.toContain('css-framework');
    });

    it('fails on a license that needs a decision, naming the package', () => {
        const root = project(
            ['./node_modules/copyleft/i.js'],
            [{ dir: 'node_modules/copyleft', manifest: { name: 'copyleft', version: '1.0.0', license: 'GPL-3.0' } }],
        );
        const { code, stderr } = run(root);

        expect(code).toBe(1);
        expect(stderr).toContain('copyleft@1.0.0: license GPL-3.0');
    });

    it('fails on a package with no declared license, and when no maps list any package', () => {
        const undeclared = project(
            ['./node_modules/mystery/i.js'],
            [{ dir: 'node_modules/mystery', manifest: { name: 'mystery', version: '1.0.0' } }],
        );
        const empty = project([], []);

        expect(run(undeclared).stderr).toContain('mystery@1.0.0');
        expect(run(empty).stderr).toContain('No bundled packages found');
    });
});
