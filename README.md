# Chinook API (Bun + Hono + Drizzle ORM + Better Auth)

![Hono Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbuiltnoble%2Fchinook-api%2Frefs%2Fheads%2Fmain%2Fapi%2Fpackage.json&query=%24.dependencies.hono&style=for-the-badge&logo=hono&label=hono&color=E36002)
![Better Auth Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbuiltnoble%2Fchinook-api%2Frefs%2Fheads%2Fmain%2Fapi%2Fpackage.json&query=%24.dependencies.better-auth&style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nNjAnIGhlaWdodD0nNDUnIHZpZXdCb3g9JzAgMCA2MCA0NScgY2xhc3M9J3ctNSBoLTUnIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PHBhdGggZmlsbC1ydWxlPSdldmVub2RkJyBjbGlwLXJ1bGU9J2V2ZW5vZGQnIGQ9J00wIDBIMTVWMTVIMzBWMzBIMTVWNDVIMFYzMFYxNVYwWk00NSAzMFYxNUgzMFYwSDQ1SDYwVjE1VjMwVjQ1SDQ1SDMwVjMwSDQ1WicgZmlsbD0nd2hpdGUnPjwvcGF0aD48L3N2Zz4=&label=better-auth&color=2B2D3E)
![Drizzle Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbuiltnoble%2Fchinook-api%2Frefs%2Fheads%2Fmain%2Fapi%2Fpackage.json&query=%24.dependencies.drizzle-orm&style=for-the-badge&logo=drizzle&label=drizzle&color=C5F74F)

This project is a **testing ground for building complex frontends** backed by a fast and modern API stack.

It uses **Bun**, **Hono**, **Drizzle ORM**, and **Better Auth** to power a lightweight, authenticated API for the classic [Chinook sample database](https://github.com/lerocha/chinook-database) — running on **PostgreSQL** via a custom Docker image that ships with the dataset preloaded.

While the main goal is to support frontend experimentation, the backend also serves as a demonstration of how quickly a fully featured and secure API can be built with new tools like **Bun**, **Hono**, and **Better Auth**.

---

## Why Bun + Hono?

This project was my first experience with both tools, and I was impressed by how easy it was to go from a clean slate to a working, type-safe API:

-   **Bun** — modern runtime with native TypeScript support and lightning-fast builds
-   **Hono** — small, elegant framework for APIs and edge runtimes
-   **Drizzle ORM** — type-safe SQL layer that makes working with Postgres straightforward
-   **Better Auth** — simple, extensible authentication system for modern TypeScript apps
-   **PostgreSQL** — the Chinook database in a custom preloaded Docker image
-   **Biome** — unified linting and formatting for clean, consistent code

---

## Features

-   Ready-to-use **Chinook dataset** served through REST endpoints
-   Full **email/password authentication** powered by **Better Auth**
-   Fully typed schema and queries with **Drizzle ORM**
-   **Docker Compose** setup that starts the API, a preloaded Postgres image, and the docs site
-   **API docs site** generated from the API's own `/openapi.json`, with guides, served next to the API
-   **Compiled binary** using Bun — no Node.js required in production
-   Clean, consistent developer experience with **Biome**

---

## Authentication Overview

Authentication is handled by **Better Auth**, using the **[email and password](https://www.better-auth.com/docs/authentication/email-password#usage)** strategy.
This secures all API routes under `/api/*` except for the auth endpoints themselves.

### Auth Endpoints

Better Auth automatically generates these routes for email/password authentication:

| Method | Endpoint                  | Description                              |
| ------ | ------------------------- | ---------------------------------------- |
| POST   | `/api/auth/sign-up/email` | Create a new user account                |
| POST   | `/api/auth/sign-in/email` | Authenticate a user and return a session |
| POST   | `/api/auth/sign-out`      | Revoke the current session               |

All API routes requiring authentication will check the session before processing the request.
For example:

```
GET /api/artists
Authorization: Bearer <access_token>
```

If no valid session exists, a `401 Unauthorized` response is returned.

---

## Frontend Context

The **Chinook API** provides a stable, well-structured backend for testing and refining complex frontend patterns.
It’s used as a **sandbox environment** to explore:

-   Advanced data fetching and caching strategies
-   Real-world state management with relational data
-   API error handling and optimistic UI updates
-   Integration testing for frontend-to-API communication

By keeping the backend lightweight and predictable, it lets me focus on **frontend complexity and developer experience** without being blocked by setup overhead.

---

## Getting Started

### Prerequisites

-   [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
-   A `.env` file with configuration values for your environment

### Configure `.env`

Copy the example file and fill in the blanks (`BETTER_AUTH_SECRET`, `DB_PASSWORD` and the `DB_*` values for commands you
run on your machine):

```sh
cp .env.example .env
```

```env
APP_PORT=3000

# Comma-separated browser origins allowed to call the API and trusted by Better Auth, e.g. http://localhost:5173,http://localhost:3001
CORS_ORIGINS=

BETTER_AUTH_SECRET=
# The address clients use for the API. Through the compose proxy that is http://api.chinook.localhost; use
# http://localhost:3000 (your APP_PORT) if you call the API directly.
BETTER_AUTH_URL=http://api.chinook.localhost

# Host ports for the docs site and for the proxy that serves api.chinook.localhost and docs.chinook.localhost.
# DOCS_TAG picks the docs image: edge follows main, or use a release such as 1.
DOCS_PORT=3001
PROXY_PORT=80
DOCS_TAG=edge

DB_USER=
DB_PASSWORD=
DB_HOST=
DB_PORT=
DB_NAME=
DB_URL=postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME
```

`CORS_ORIGINS` must list the origin of any frontend that calls the API from a browser (for example your
Vite dev server). Requests from origins that are not listed receive no CORS headers and are blocked by the
browser. Leave it empty to allow no cross-origin browser requests.

Better Auth trusts the same list, so a listed frontend can also sign in and out when its requests carry
cookies; Better Auth's own base URL (`BETTER_AUTH_URL`) is always trusted. An origin that is in neither place
gets `403 INVALID_ORIGIN` on those requests.

> **Upgrading an existing `.env`:** `BETTER_AUTH_URL` used to be `http://localhost:3000`. To call the API from a
> browser at `http://api.chinook.localhost`, set it to that address (or list the origin in `CORS_ORIGINS`).
> curl sends no `Origin` header, so it works either way. Insomnia needs one once it holds a session cookie; see
> [docs/guides/INSOMNIA.md](docs/guides/INSOMNIA.md).

---

### Run with Docker Compose

The `docker-compose.yml` file starts:

1. A **PostgreSQL** service preloaded with the Chinook dataset (from my published image,
   [`builtnoble/chinook-postgres:1`](https://github.com/builtnoble/chinook-postgres))
2. The **Bun-compiled API** container
3. The **docs site**, a published image (`builtnoble/chinook-docs`) that holds the API reference and guides
4. A small **Caddy proxy** that gives the API and the docs a hostname each

Command to run:

```sh
docker compose up -d --build
```

| What          | Through the proxy                                          | Directly                                      |
| ------------- | ---------------------------------------------------------- | --------------------------------------------- |
| API           | [http://api.chinook.localhost](http://api.chinook.localhost) | [http://localhost:3000](http://localhost:3000) |
| API docs      | [http://docs.chinook.localhost](http://docs.chinook.localhost) | [http://localhost:3001](http://localhost:3001) |

`*.localhost` names point at your own machine in browsers and curl, so there is nothing to add to a hosts file. The
proxy listens on port 80; set `PROXY_PORT` if that is taken and add the port to the URLs
(`http://api.chinook.localhost:8080`).

The first time, create the Better Auth tables (this needs [Bun](https://bun.sh)):

```sh
cd api
bun install
bunx drizzle-kit migrate
```

#### Data persistence and resetting

Database data lives in the `chinook-data` named volume, so changes (including Better Auth accounts) survive
`docker compose down`. The seed data is only loaded into an empty volume, so pulling a newer image does not
change data that already exists.

To get back to the original Chinook data:

```sh
# In place: restores the Chinook tables and leaves the auth tables alone
docker compose exec db chinook-reset

# Or discard the volume entirely; it re-seeds on the next `up`
docker compose down -v
(cd api && bunx drizzle-kit migrate)   # recreates the auth tables
```

Deleting a playlist, track or invoice also deletes its `playlist_tracks` or `invoice_lines` rows. Deleting an
artist that still has albums, or a track that appears on an invoice line, fails with a foreign key error.

---

## Example Endpoints

Authenticated endpoints require a valid token or session. For a step-by-step walkthrough of creating an
account, signing in and calling every endpoint with Insomnia, see [docs/guides/INSOMNIA.md](docs/guides/INSOMNIA.md), or the same
guide on the docs site. The docs site also has a reference page for every resource, built from the API's own spec.

```
GET /api/artists/1
Authorization: Bearer <access_token>
```

Example response:

```
{
	"data": {
		"id": 1,
		"name": "AC/DC"
	}
}
```

---

## API Docs Site

The docs site holds the guides and a reference page for every resource, built from the API's own `/openapi.json`. It is
published as a Docker image, [`builtnoble/chinook-docs`](https://hub.docker.com/r/builtnoble/chinook-docs), and
`docker compose up` already pulls and starts it as the `docs` service. Once the stack is up, it is at
[http://docs.chinook.localhost](http://docs.chinook.localhost) (or [http://localhost:3001](http://localhost:3001)).

Settings in `.env`:

| Variable    | Default | What it does                                                                         |
| ----------- | ------- | ------------------------------------------------------------------------------------ |
| `DOCS_TAG`  | `edge`  | Which image to pull: `edge` follows `main`, or pin a release such as `1`, `1.0`, `1.0.0` |
| `DOCS_PORT` | `3001`  | The host port for the direct address                                                 |

To update to the latest published docs:

```sh
docker compose pull docs
docker compose up -d docs
```

The image is a static site served by nginx and does not need the API or the database, so you can also run it on its own:

```sh
docker run --rm -p 3001:8080 builtnoble/chinook-docs:edge
```

Images are published for `amd64` and `arm64`. The site only shows what was published: to change a page, or to preview
a change before it is published, see [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md#documentation).

---

## Contributing

Setting up the API for local development, linting, tests, commit conventions and working on the docs are in
[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).

---

## License

The code and documents in this repository are released under the [MIT License](LICENSE).

The Chinook table definitions mirror the [Chinook database](https://github.com/lerocha/chinook-database) by Luis Rocha,
also MIT-licensed; its notice is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The design of the published docs
image comes from a Tailwind Plus template that is licensed separately and is not part of this repository, and the
image lists the open-source libraries it bundles at `/third-party-licenses.txt`. The same file covers the licenses of
the npm dependencies and base images.
