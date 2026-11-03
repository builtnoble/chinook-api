# Contributing Guide

Thank you for your interest in contributing! This project is a **learning sandbox** and a **testbed** for
building authenticated APIs with Bun, Hono, Drizzle ORM and Better Auth. Contributions that improve code
quality, extend the examples or make the project easier to work on are welcome.

---

## Repository Layout

The repository holds two projects that are built and run separately:

| Path         | What it is                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `api/`       | The Hono API: source, Drizzle schema and migrations, its Dockerfile and tests                    |
| `docs-site/` | The generator and Docker image for the API docs site (see [docs-site/README.md](../docs-site/README.md)) |
| `docs/`      | The Markdown that becomes the docs site's Introduction and Insomnia guide                        |
| `proxy/`     | The Caddy config that serves `api.chinook.localhost` and `docs.chinook.localhost`                |

`.env`, `.env.example` and `docker-compose.yml` are shared and stay at the root.

---

## Environment Setup

This project uses **[Bun](https://bun.sh)** as both the runtime and the package manager. Install it first:

```bash
curl -fsSL https://bun.sh/install | bash
```

Clone the repository and install the dependencies of the API and the docs generator. They are Bun workspaces
that share one lockfile:

```bash
git clone https://github.com/builtnoble/chinook-api.git
cd chinook-api
bun install
```

---

## Local Development

1. Copy `.env.example` as `.env` **at the repository root**, and fill it in:

    ```bash
    cp .env.example .env
    ```

2. Start only the database container (from the repository root):

    ```bash
    docker compose up -d db
    ```

3. Run the database migrations (from `api/`):

    ```bash
    cd api
    bunx drizzle-kit migrate
    ```

4. Start the development server:
    ```bash
    bun run dev
    ```

The server reads its settings from the root `.env`. If the `app` container from `docker compose up` is
running, stop it first (`docker compose stop app`); it uses the same port.

---

## Code Quality

This project uses **[Biome](https://biomejs.dev)** for linting and formatting. It is set up at the repository
root and checks the whole repository. Before opening a pull request, make sure your code passes:

```bash
bun run lint            # check
bun run lint --write    # fix what it can
```

Run it after `bun install` so you get the pinned version. Without that, `bunx biome` fetches the latest
version and can report errors the pinned one does not.

A pull request that fails the Biome checks will be asked to fix them before merging.

---

## Commit Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>
```

For example:

```text
feat: add the playlist write routes
fix(docs-site): keep the page lead when a guide starts with an image
```

| Type       | Description                                    |
| ---------- | ---------------------------------------------- |
| `feat`     | A new feature                                  |
| `fix`      | A bug fix                                      |
| `docs`     | Documentation-only changes                     |
| `test`     | Adding or improving tests                      |
| `chore`    | Maintenance or tooling changes                 |
| `refactor` | Code changes that do not affect behavior       |
| `style`    | Formatting-only changes                        |

---

## Testing

Tests use Bun's test runner. The API's tests are in `api/tests` and the docs generator's are in
`docs-site/tests`, each laid out like the code it covers.

```bash
bun run test                     # the API and the docs generator
cd api && bun run test           # the API only
cd docs-site && bun test         # the docs generator only
```

Please add tests for new endpoints and features, especially around sign-in, route protection and database
queries. The API's tests do not need a database.

---

## Documentation

The docs site is generated, so each page has one place to edit. See
[docs-site/README.md](../docs-site/README.md) for how it is built.

-   **A new route** needs a tag, a summary and a description in its `describeRoute` options, for example through
    `describeList` and `describeByID` in `api/src/openapi/index.ts`. A test fails without them. Its reference page
    then appears on the site by itself.
-   **The Introduction and the Insomnia guide** are `docs/INTRODUCTION.md` and `docs/guides/INSOMNIA.md`. Edit the
    Markdown, and avoid HTML comments and GitHub-only alerts such as `> [!NOTE]`, which MDX cannot read. The
    generator names the line, and a test compiles the real files.
-   **The site's design** is a licensed template in a private repository, so it cannot be changed in a pull
    request. You do not need it: the docs tests, and `docker compose up`, work without it.

### Previewing docs changes

The `docs` service in `docker compose up` is a published image, so edits to `docs/` or the API do not reach it.
To see them as you type, run the docs dev server on your machine. It needs [Bun](https://bun.sh) and the site's
design, which is the private template: check it out next to this repository as `../chinook-docs-theme`, or set
`THEME_DIR`. Without it you can still edit the Markdown and run `bun test` in `docs-site/`, which compiles the
real files. The published site picks the change up after it is merged.

```bash
cd docs-site
bun run preview        # http://127.0.0.1:3001
```

It copies the theme into `chinook-docs-theme-preview` (next to the theme, outside this repository), generates
the pages and starts the theme's dev server. It then watches `docs/`, `docs-site/content`,
`docs-site/generator` and `api/src`, and regenerates the pages when any of them change, so a saved edit shows up
in the open browser tab. Leave it running.

-   **The first run** installs the theme's dependencies and takes a few minutes.
-   **Port 3001** is also used by the compose `docs` service. Stop it (`docker compose stop docs`) or pick
    another port with `PORT=3002 bun run preview`.
-   **A change to the theme** only shows up after you restart the preview.

---

## Submitting a Pull Request

1. Fork the repository and create your branch:
    ```bash
    git checkout -b feat/new-endpoint
    ```
2. Make your changes and check that lint and tests pass:
    ```bash
    bun run lint
    bun run test
    ```
3. Commit your changes in the conventional commit style.
4. Push to your fork and open a pull request that describes your change. Add context, screenshots if they
   help, and links to any related issues.

---

## Contribution Guidelines

-   Keep code **type-safe** and consistent with the existing Drizzle setup.
-   **Document new routes** with a tag, a summary and a description (see Documentation above), and add an example
    to the README if they are part of the API.
-   Do not add new dependencies without discussing it first.
-   Discuss security-sensitive changes, especially around sign-in, in an issue first.
-   This repository is also a **learning tool**, so clear examples matter as much as working code.
-   By contributing you agree that your contribution is released under the repository's [MIT License](../LICENSE).
