# Docs site

The API documentation for `chinook.docs`. It is generated, not written here:

- **The API reference** (one page per resource) comes from the API's `/openapi.json`.
- **The Introduction and the guides** come from `docs/INTRODUCTION.md` and the files in `docs/guides/`.
  Edit those files; they are the only copy.

This directory holds the generator that turns both into pages, and the Dockerfile that builds the site. It holds
none of the site's look. That is the [Protocol](https://tailwindcss.com/plus/templates/protocol) template from
Tailwind Plus, adapted in a **private** repository, `chinook-docs-theme`. Protocol's license does not allow
publishing the template or anything derived from it, so none of its code may be added to this repository.

If you only want to use the docs, you do not need any of this: `docker compose up -d` pulls the published image.

## What lives where

| Path                 | Purpose                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `generator/`         | Turns the OpenAPI spec and the Markdown into MDX pages                          |
| `tests/`             | The tests (`bun test`), laid out like the code they test, with sample specs in `fixtures/` |
| `content/pages.json` | Which files in `docs/` are published, with their titles and card descriptions   |
| `Dockerfile`         | Builds the site into an nginx image                                             |
| `nginx.conf`         | Serves the static files (`/albums` is `albums.html`)                            |
| `scripts/preview.sh` | Runs the site locally against your copy of the theme, reloading as the sources change |
| `scripts/third-party-licenses.mjs` | Writes the license notices for the packages bundled into the site (see below) |

The generator writes its pages into the theme at build time and never reads the theme, so the two only share the
contract below.

## Preview

You need the theme checked out next to this repository (`../chinook-docs-theme`, or set `THEME_DIR`).

```bash
cd docs-site
bun run preview        # http://127.0.0.1:3001
```

It exports the spec, copies the theme to `chinook-docs-theme-preview` (next to the theme), generates the pages
into the copy and starts the theme's dev server. It then watches `docs/`, `docs-site/content`,
`docs-site/generator` and `api/src`, and regenerates the pages when any of them change, so an edit shows up in
the open browser tab. Leave it running. The first run installs the theme's dependencies. Set `PORT` to use
another port, for example when `docker compose up` already serves the published docs on 3001.

Keep the copy outside this repository. Next.js warns when it finds both this repository's `bun.lock` and the
theme's own `package-lock.json`. Set `PREVIEW_DIR` to put the copy somewhere else, but not inside the repository.

## Build the image

From the repository root:

```bash
docker buildx build -f docs-site/Dockerfile \
  --build-context theme=../chinook-docs-theme \
  --build-arg GIT_SHA="$(git rev-parse --short HEAD)" \
  -t builtnoble/chinook-docs:dev .
docker run --rm -p 3001:8080 builtnoble/chinook-docs:dev
```

The Dockerfile builds in stages. Only the last one is in the image, so the theme's source is not:

1. `spec` exports `openapi.json` from the API, with no database and no running server.
2. `content` installs the generator's few production dependencies and runs it over the spec and `docs/`. It also
   bundles the license script.
3. `site` copies the theme in, writes the generated pages over it, and builds the static site.
4. `licenses` builds the site again with source maps and writes the license notices (see below).
5. `runtime` is `nginx-unprivileged` with the built files. It runs as a non-root user and has a healthcheck.

The theme is passed as a named build context, so it never has to be in this repository's build context. The
`docs-publish` workflow builds the published image, and checks the theme out with a read-only deploy key.

## License notices

The site's minified JavaScript carries no license comments, and the libraries bundled into it (MIT, Apache-2.0)
require their notices to be included with copies. So the image build makes a second build of the site with source
maps, reads which packages they list, and writes `third-party-licenses.txt` into the image. The footer links to
it. The maps and that build are not part of the image, and the publish workflow checks that no `.map` files are
served.

The step fails the image build if a bundled package has no license text and no declared license, or has a license
that is not permissive (GPL, LGPL, MPL and the like), so a new dependency that needs a decision cannot slip in. A
license expression is read the SPDX way: `MIT OR GPL-3.0` passes because one side is permissive, `MIT AND GPL-3.0`
does not, and an exception (`WITH`) or a string that is not SPDX is left to a person. The script has its own
tests, which run without the theme.

## Publishing

The `docs-publish` workflow builds the image and pushes it to Docker Hub for `linux/amd64` and `linux/arm64`. The
tags are `edge` for `main`, and `1.2.3`, `1.2`, `1` and `latest` for `v*` tags. What it needs (the private theme,
a deploy key and three secrets) is described at the top of `.github/workflows/docs-publish.yml`.

The image's fixed labels (title, description, source, licenses) are in the Dockerfile, as in `chinook-postgres`.
The workflow only passes the labels that change per build (created, revision, version, url). The licenses label
makes no claim, because the site's design is under the Tailwind Plus license and not the repository's MIT
license.

[`DOCKERHUB.md`](DOCKERHUB.md) is the text for the Docker Hub repository's Overview. Docker Hub does not read it
from the repository, so paste it into the repository settings when it changes. Keep the repository public, so
that compose can pull the image without logging in.

## The contract with the theme

The generator writes these files into the theme:

| Path                            | Contents                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/app/page.mdx`              | The Introduction, ending with the `Guides` and `Resources` cards                              |
| `src/app/<guide>/page.mdx`      | One page per guide in `content/pages.json`                                                    |
| `src/app/<tag>/page.mdx`        | One page per API tag, such as `src/app/media-types/page.mdx`                                  |
| `src/generated/navigation.json` | `[{ title?, links: [{ title, href, description? }] }]`: the Introduction, then Guides, then Resources |
| `src/generated/meta.json`       | `{ title, version, baseUrl }`, from the spec                                                  |

Pages use only the components the theme exports from `src/components/mdx.tsx` (`Row`, `Col`, `Properties`,
`Property`, `CodeGroup`, `Note`, `Button`), plus `Guides`, `Resources` and `HeroPattern` on the Introduction. The
theme's own README lists what it changes in Protocol.

## Adding or changing pages

- **A new API resource** needs nothing: give its routes a tag and a summary (a test requires both) and the page
  appears. The generator stops, naming the operation, if a tag or summary is missing.
- **Editing a document:** change the Markdown in `docs/`. Avoid HTML comments and GitHub-only alerts
  (`> [!NOTE]`), which MDX cannot read. The generator reports the line, and a test compiles the real documents,
  so CI catches it.
- **A new guide:** add the Markdown file to `docs/guides/` and an entry to `content/pages.json`.
- **Links to other files in the repository** are ordinary relative links. Links to other published documents
  become site links, and links to anything else point at GitHub.
