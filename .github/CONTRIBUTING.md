# Contributing Guide

First off, thank you for your interest in contributing!
This project is designed as both a **learning sandbox** and a **testbed** for building modern, authenticated APIs using Bun, Hono, Drizzle ORM, and Better Auth.
Contributions that improve code quality, extend examples, or help refine the developer experience are always welcome.

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

This project uses **[Bun](https://bun.sh)** as both the runtime and the package manager.
Make sure Bun is installed before proceeding:

```bash
curl -fsSL https://bun.sh/install | bash
```

Clone the repository and install the API's dependencies:

```bash
git clone https://github.com/builtnoble/chinook-api.git
cd chinook-api/api
bun install
```

---

## Local Development

1. Copy `.env.example` as `.env` **at the repository root**, and fill it in:

    ```bash
    cp .env.example .env
    ```

2. Start only the database container in detached mode (from the repository root):

    ```bash
    docker compose up -d db
    ```

3. Run database migrations using Drizzle (from `api/`):

    ```bash
    cd api
    bunx drizzle-kit migrate
    ```

4. Start the development server:
    ```bash
    bun run dev
    ```

This command runs the API with Hono, Drizzle, and Better Auth active, using environment variables from the root `.env`
file. If the `app` container from `docker compose up` is running, stop it first (`docker compose stop app`): it uses
the same port.

---

## Code Quality

This project uses **[Biome](https://biomejs.dev)** for both linting and formatting. Biome is installed in `api/` and
`docs-site/` and its config is at the root, so run it from either directory; it checks the whole repository.
Before opening a pull request, ensure your code is clean and consistent:

```bash
cd api
bun run lint            # check
bun run lint --write    # fix what it can
```

Run it through `bun run` and not `bunx biome` from the root: there is no Biome installed at the root, so `bunx` would
fetch whatever version is latest and report errors the pinned version does not.

PRs that don’t pass Biome checks will be requested to fix before merging.

---

## Commit Conventions

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification to keep commit
messages consistent and automation-friendly.

### Format

Each commit message should follow this general structure:

```
<type>[optional scope]: <description>
```

#### Examples

Without scope:

```text
feat: add support for multiple manifest files
```

With scope:

```text
fix(tests): correct missing CSS assertion in asset output
```

#### Common Types found in project

| Type       | Description                                    |
| ---------- | ---------------------------------------------- |
| `feat`     | A new feature                                  |
| `fix`      | A bug fix                                      |
| `docs`     | Documentation-only changes                     |
| `test`     | Adding or improving tests                      |
| `chore`    | Maintenance or tooling changes                 |
| `refactor` | Code refactors that don’t affect functionality |
| `style`    | Code style or formatting-only changes          |

Following this format helps with automated changelogs, semantic versioning, and clearer project history.

---

## Testing

Tests use Bun’s native test runner and live next to the code they cover.

```bash
cd api && bun run test           # the API
cd docs-site && bun test         # the docs generator
```

Contributors are encouraged to add test cases for new endpoints or features, especially around authentication, route
protection, and database queries. The API's tests do not need a database.

---

## Documentation

The docs site is generated, so there is one place to edit each page. See [docs-site/README.md](../docs-site/README.md)
for how it is built.

-   **A new route** needs a tag, a summary and a description on its `describeRoute` options, for example through
    `describeList` and `describeByID` in `api/src/utils/openapi.ts`. A test fails without them, and its reference page
    appears on the site by itself.
-   **The Introduction and the Insomnia guide** are `docs/INTRODUCTION.md` and `docs/INSOMNIA.md`. Edit the Markdown.
    Avoid HTML comments and GitHub-only alerts such as `> [!NOTE]`, which MDX cannot take; the generator names the
    line, and a test compiles the real files.
-   **The site's design** is a licensed template kept in a private repository, so it cannot be changed in a pull
    request. You do not need it: the docs tests, and `docker compose up`, work without it.

---

## Submitting a Pull Request

1. Fork the repository and create your branch:
    ```bash
    git checkout -b feat/new-endpoint
    ```
2. Make your changes and ensure lint/test checks pass:
    ```bash
    cd api
    bun run lint
    bun run test
    ```
    If you changed `docs-site/` or `docs/`, also run `bun test` in `docs-site/`.
3. Commit your changes following conventional commit style.
4. Push to your fork and open a Pull Request describing your change.

Please include relevant context, screenshots (if applicable), and reference any related issues.

---

## Contribution Guidelines

-   Keep code **type-safe** and consistent with the existing Drizzle setup.
-   **Document new routes** with a tag, summary and description (see Documentation above), and add an example to the
    README if they’re part of the API surface.
-   Don’t introduce new dependencies without discussion.
-   Security-sensitive changes (especially around auth) should be discussed via issue first.
-   Be mindful that this repository also serves as a **learning tool**, so clarity in examples is valued as much as functionality.
