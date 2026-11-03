# Third-party notices

## Chinook database

The Chinook table and column definitions in `api/src/db/chinookSchema.ts` and in the baseline migration under `api/drizzle/`
mirror the schema of the [Chinook database](https://github.com/lerocha/chinook-database) by Luis Rocha, which is
distributed under the following license. This notice is reproduced as that license requires. The sample rows shown in
the documentation's examples come from the same dataset.

```text
Chinook Database
--------------------------------------
Copyright (c) 2008-2024 Luis Rocha

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated 
documentation files (the "Software"), to deal in the Software without restriction, including without limitation 
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and 
to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## The docs site's design and bundled libraries

The published docs image (`builtnoble/chinook-docs`) is built with a template that is not part of this repository: the
[Protocol](https://tailwindcss.com/plus/templates/protocol) template from Tailwind Plus, used under the
[Tailwind Plus license](https://tailwindcss.com/plus/license). That template's source is not published here, and this
repository's MIT license does not cover it or the compiled site built from it. The generator, the Dockerfile and the
documents in `docs-site/` and `docs/` are MIT-licensed like the rest of the repository.

The compiled site bundles open-source JavaScript libraries (React, Next.js, Headless UI, FlexSearch and others) and
CSS from Tailwind CSS. Their licenses require their notices to travel with copies, and minification removes the license
comments, so the image build writes the notices to `/third-party-licenses.txt`, which the site's footer links to. The
list is read from the build itself, so it covers exactly the packages that are bundled. The build fails if a bundled
package has a license that is not permissive or cannot be identified. See `docs-site/scripts/third-party-licenses.mjs`.

## Dependencies installed from npm

This repository does not contain its npm dependencies; they are installed from the lockfile (`bun.lock`).
Their licenses were checked when these notices were written:

-   **`api/`**: all 62 production packages are under permissive licenses (MIT, Apache-2.0, ISC, BSD-2-Clause,
    BSD-3-Clause or 0BSD). Four packages from the Better Auth family omit the `license` field in
    their package.json: `@better-auth/core`, `@better-auth/telemetry` and `@better-fetch/fetch` ship an MIT license
    file, and `better-call` ships none but is MIT-licensed in [its repository](https://github.com/Bekacru/better-call).
-   **`docs-site/`**: all 130 production packages (`unified`, `remark-parse`, `remark-gfm`, `@sindresorhus/slugify`,
    `@readme/httpsnippet`, `openapi-sampler`, `@apidevtools/json-schema-ref-parser`, `mdast-util-mdx` and their
    dependencies, which the generator uses to convert Markdown, to name anchors, to write the request examples, to
    fill in example values, to resolve `$ref`s and to write the pages) are under permissive licenses (MIT,
    BSD-2-Clause, BSD-3-Clause, ISC, PSF-2.0, or MIT OR CC0-1.0). The one PSF-2.0 package is `argparse`, which
    `js-yaml` needs. Its 48 further development packages (the MDX compiler, the OpenAPI types and their
    dependencies) are MIT, ISC or BSD-3-Clause.
-   **The repository root**: its 15 development packages (Biome, the Bun types, `type-fest` and their dependencies) are
    MIT, MIT OR Apache-2.0 or MIT OR CC0-1.0.
-   **The docs theme's build** (in the private repository) uses some tools under other licenses: `lightningcss`
    (MPL-2.0), `sharp`'s libvips (LGPL-3.0) and `caniuse-lite` (CC-BY-4.0). They run during the build and are not in the
    published image.

## The compiled API

The API's Docker image is built locally by `docker compose` and is not published. If you publish it, note that
`bun build --compile` embeds the Bun runtime and the bundled npm dependencies in the binary. Bun is MIT-licensed, but it
statically links JavaScriptCore and WebKit, which are LGPL-2 licensed
([Bun's licensing page](https://bun.sh/docs/project/licensing)). That page does not say how this applies to compiled
executables, so check it before distributing the binary. Each bundled dependency's notice also needs to travel with it.

## Software in the base images

The published docs image is built on the official [`nginxinc/nginx-unprivileged`](https://hub.docker.com/r/nginxinc/nginx-unprivileged)
image. nginx, Alpine Linux and the other software it contains are distributed under their own licenses, which are not
changed by this repository's license. `docker-compose.yml` also pulls the unmodified `caddy` image (Apache-2.0) and
[`builtnoble/chinook-postgres`](https://github.com/builtnoble/chinook-postgres), which is covered by its own license and
notices.
