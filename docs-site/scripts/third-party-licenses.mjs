// Writes the notices for the open-source packages bundled into the built site's
// JavaScript.
//
// The minified bundles carry no license comments, and MIT and Apache-2.0 both
// require the notice to travel with a copy, so the published image ships this
// file next to the site. Which packages are bundled is read from the source
// maps of a build made with them enabled, instead of guessed from package.json:
// build tools and libraries that only run during the build (the CSS compiler,
// image libraries) are not in the output and are not listed.
//
//   bun third-party-licenses.mjs <project dir> <output file>
//     [--also name,name]
//
// <project dir> holds the built `out/` (with .map files) and `node_modules/`.
// --also adds packages whose code is in the output without appearing in a
// source map, such as the CSS framework.
//
// Fails if a bundled package has no recognized permissive license, or no
// license text and no declared license, so a new dependency that needs a
// decision cannot slip into the image unnoticed.
//
// The image build bundles this file with the one package it imports, because
// the stage that runs it holds only the theme's packages, and gives that stage
// Bun to run it with.
import { join } from 'node:path';
import parse from 'spdx-expression-parse';

const [projectDir, outputFile, ...flags] = Bun.argv.slice(2);
if (!projectDir || !outputFile) {
    console.error('Usage: bun third-party-licenses.mjs <project dir> <output file> [--also name,name]');
    process.exit(2);
}
const also = flags[0] === '--also' ? (flags[1] ?? '').split(',').filter(Boolean) : [];

// The licenses that allow redistribution with only a notice. Anything else is a
// decision for a person.
const PERMISSIVE = /^(MIT|MIT-0|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|0BSD|CC0-1\.0|Unlicense|BlueOak-1\.0\.0)$/;
const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.|$)/i;

// Whether permissive licenses alone satisfy an SPDX expression: one side of an
// OR is enough and both sides of an AND are needed. An exception (WITH) changes
// the terms, so it is left to a person, as is anything that does not parse.
const accepted = (node) => {
    if ('license' in node) return PERMISSIVE.test(node.license) && !node.exception;

    return node.conjunction === 'or'
        ? accepted(node.left) || accepted(node.right)
        : accepted(node.left) && accepted(node.right);
};

const acceptable = (license) => {
    try {
        return accepted(parse(license));
    } catch {
        return false;
    }
};

// "webpack://_N_E/./node_modules/a/node_modules/@s/b/dist/x.js" ->
// "node_modules/a/node_modules/@s/b"
const packageDirOf = (source) => {
    const first = source.indexOf('node_modules/');
    if (first < 0) return undefined;

    const relative = source.slice(first);
    const last = relative.lastIndexOf('node_modules/');
    const [scopeOrName, maybeName] = relative.slice(last + 'node_modules/'.length).split('/');
    const name = scopeOrName.startsWith('@') ? `${scopeOrName}/${maybeName}` : scopeOrName;
    return relative.slice(0, last + 'node_modules/'.length) + name;
};

const dirs = new Set(also.map((name) => `node_modules/${name}`));
const maps = new Bun.Glob('**/*.map').scan({ cwd: join(projectDir, 'out'), absolute: true });
for await (const file of maps) {
    const { sources = [] } = await Bun.file(file).json();
    for (const source of sources) {
        const dir = packageDirOf(source);
        if (dir) dirs.add(dir);
    }
}
if (dirs.size === 0) {
    console.error('No bundled packages found. Was the site built with source maps?');
    process.exit(1);
}

const declaredLicense = ({ license, licenses }) => {
    const value = license ?? licenses;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map((entry) => entry.type ?? entry).join(' OR ');
    return value?.type;
};

const repositoryOf = ({ repository, homepage }) => {
    const url = typeof repository === 'string' ? repository : repository?.url;
    const cleaned = (url ?? homepage ?? '')
        .replace(/^git\+/, '')
        .replace(/\.git$/, '')
        .replace(/^git:\/\//, 'https://');
    // npm's shorthand: "owner/repo" means GitHub.
    return /^[\w.-]+\/[\w.-]+$/.test(cleaned) ? `https://github.com/${cleaned}` : cleaned;
};

const packages = new Map();
const problems = [];
for (const dir of [...dirs].sort()) {
    const path = join(projectDir, dir);
    const manifest = await Bun.file(join(path, 'package.json'))
        .json()
        .catch(() => null);
    if (!manifest) {
        problems.push(`${dir}: no package.json`);
        continue;
    }

    const listed = await Array.fromAsync(new Bun.Glob('*').scan({ cwd: path, onlyFiles: true, followSymlinks: true }));
    const files = await Promise.all(
        listed
            .filter((name) => LICENSE_FILE.test(name))
            .sort()
            .map(async (name) => ({ name, text: (await Bun.file(join(path, name)).text()).trim() })),
    );

    const license = declaredLicense(manifest);
    const id = `${manifest.name}@${manifest.version}`;
    if (!license || !acceptable(license)) {
        problems.push(`${id}: license ${license ?? '(not declared)'} is not one this file accepts`);
    }
    if (files.length === 0 && !license) problems.push(`${id}: no license text and no declared license`);

    packages.set(id, { id, license, repository: repositoryOf(manifest), files });
}

if (problems.length > 0) {
    console.error(`Cannot write the notices:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    process.exit(1);
}

// Packages whose license text is identical share one copy of it.
const groups = new Map();
for (const entry of [...packages.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const text = entry.files.length
        ? entry.files.map((file) => (entry.files.length > 1 ? `[${file.name}]\n${file.text}` : file.text)).join('\n\n')
        : `This package ships no license file. Its package.json declares the ${entry.license} license.`;
    groups.set(text, [...(groups.get(text) ?? []), entry]);
}

const rule = '='.repeat(78);
const sections = [...groups].map(([text, entries]) => {
    const headings = entries
        .map(({ id, license, repository }) =>
            [id, `  License: ${license}`, repository && `  Source: ${repository}`].filter(Boolean).join('\n'),
        )
        .join('\n\n');
    return `${rule}\n${headings}\n${'-'.repeat(78)}\n${text}\n`;
});

const header = `Third-party software in the Chinook API docs site

The site's JavaScript bundles the ${packages.size} open-source packages below, each under the license shown. The licenses
are reproduced as they require. This is the list of what is in the built site, generated by the image build.

The site's design is derived from the Tailwind Plus Protocol template, which is used under the Tailwind Plus license
(https://tailwindcss.com/plus/license). That template is not open source and is not listed here.

`;

await Bun.write(outputFile, `${header}${sections.join('\n')}`);
console.log(`Wrote ${packages.size} notices to ${outputFile}`);
