# Chinook API docs

The documentation site for the [Chinook API](https://github.com/builtnoble/chinook-api): a reference page for every
resource, generated from the API's own OpenAPI document, plus an introduction and a guide to calling the API from
Insomnia. It is a static site served by nginx.

Most people never run this image directly. `docker compose up -d` in the
[chinook-api](https://github.com/builtnoble/chinook-api) repository pulls it and serves it at
`http://docs.chinook.localhost` (and `http://localhost:3001`), next to the API.

## Run it on its own

```sh
docker run --rm -p 3001:8080 builtnoble/chinook-docs:edge
```

Then open <http://localhost:3001>. The request examples in the docs point at `http://api.chinook.localhost`, which is
where the compose stack serves the API.

## Tags

| Tag                       | What it is                                                      |
| ------------------------- | --------------------------------------------------------------- |
| `edge`                    | The latest build of the `main` branch                           |
| `1.2.3`, `1.2`, `1`       | A release, following the repository's `v*` tags                 |
| `latest`                  | The latest release                                              |

The docs match the API of the same version, so use a tag that matches the checkout you run the API from. In compose,
`DOCS_TAG` in `.env` picks it. Images are published for `linux/amd64` and `linux/arm64`.

## About the image

-   Serves on port `8080` and runs as a non-root user (`nginx-unprivileged`).
-   Has a healthcheck, so compose can wait for it.
-   Needs no configuration or environment variables.
-   Holds only compiled static files. No source, no Node.js and no build tools are in it.

## Source and license

The generator, the Dockerfile and the documents are in the
[chinook-api repository](https://github.com/builtnoble/chinook-api/tree/main/docs-site).

The site's design is derived from the [Protocol](https://tailwindcss.com/plus/templates/protocol) template from
Tailwind Plus and is used under the [Tailwind Plus license](https://tailwindcss.com/plus/license). The template's source
is not published, and this image contains only the compiled site.
