# Chinook API (Bun + Hono + Drizzle ORM + Better Auth)

![Hono Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbuiltnoble%2Fchinook-api%2Frefs%2Fheads%2Fmain%2Fapi%2Fpackage.json&query=%24.dependencies.hono&style=for-the-badge&logo=hono&label=hono&color=E36002)
![Better Auth Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbuiltnoble%2Fchinook-api%2Frefs%2Fheads%2Fmain%2Fapi%2Fpackage.json&query=%24.dependencies.better-auth&style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nNjAnIGhlaWdodD0nNDUnIHZpZXdCb3g9JzAgMCA2MCA0NScgY2xhc3M9J3ctNSBoLTUnIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PHBhdGggZmlsbC1ydWxlPSdldmVub2RkJyBjbGlwLXJ1bGU9J2V2ZW5vZGQnIGQ9J00wIDBIMTVWMTVIMzBWMzBIMTVWNDVIMFYzMFYxNVYwWk00NSAzMFYxNUgzMFYwSDQ1SDYwVjE1VjMwVjQ1SDQ1SDMwVjMwSDQ1WicgZmlsbD0nd2hpdGUnPjwvcGF0aD48L3N2Zz4=&label=better-auth&color=2B2D3E)
![Drizzle Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbuiltnoble%2Fchinook-api%2Frefs%2Fheads%2Fmain%2Fapi%2Fpackage.json&query=%24.dependencies.drizzle-orm&style=for-the-badge&logo=drizzle&label=drizzle&color=C5F74F)

This project is a **testing ground for building complex frontends** against a fast, modern API. It uses
**Bun**, **Hono**, **Drizzle ORM** and **Better Auth** to serve the classic
[Chinook sample database](https://github.com/lerocha/chinook-database) over REST, from **PostgreSQL** in a
custom Docker image that ships with the data loaded.

It is also a small demonstration of how quickly a typed, secure API can be built with these tools. It was
my first project with Bun and Hono, and going from a clean slate to a working API was easy.

---

## Built with

-   **Bun** - runs TypeScript directly, and compiles the API to a single binary (no Node.js needed in production)
-   **Hono** - a small framework for APIs
-   **Drizzle ORM** - typed SQL queries for Postgres
-   **Better Auth** - email and password sign-in
-   **PostgreSQL** - the Chinook data, in a custom Docker image
-   **Biome** - linting and formatting

The API serves the Chinook data over REST: anyone signed in can read it, and admins can create, update and
delete it. A docs site, generated from the API's own `/openapi.json`, runs
next to it with a reference page for every resource and a guide.

---

## Authentication

Sign-in uses Better Auth's **[email and password](https://www.better-auth.com/docs/authentication/email-password#usage)**
method. Every route under `/api/*` needs a session, except the auth endpoints themselves:

| Method | Endpoint                  | Description                              |
| ------ | ------------------------- | ---------------------------------------- |
| POST   | `/api/auth/sign-up/email` | Create a new user account                |
| POST   | `/api/auth/sign-in/email` | Sign in and return a session             |
| POST   | `/api/auth/sign-out`      | End the current session                  |

Send the session as a bearer token:

```
GET /api/artists
Authorization: Bearer <access_token>
```

Without a valid session the answer is `401 Unauthorized`.

Any signed-in user can read. Writes (`POST`, `PATCH` and `DELETE`) need the `admin` role, and a signed-in
user without it gets `403`. Signing up always creates an ordinary user, so the first admin is created from
the command line; see [Create an admin](#create-an-admin). Better Auth's admin plugin also adds endpoints under
`/api/auth/admin/*` for admins.

**Known limitation:** sign-up is open and email addresses are not verified. Anyone can register, but only as an
ordinary user. Before you expose an instance publicly, close sign-up or add email verification.

---

## Getting Started

### Prerequisites

-   [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
-   [Bun](https://bun.sh), for the first-run setup and for running commands on your machine

### Configure `.env`

Copy the example file and fill in the blanks (`BETTER_AUTH_SECRET`, `DB_PASSWORD` and the `DB_*` values for
commands you run on your machine):

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

`CORS_ORIGINS` must list the origin of any frontend that calls the API from a browser (for example your Vite
dev server). Requests from other origins get no CORS headers and the browser blocks them. Leave it empty to
allow no cross-origin browser requests.

Better Auth trusts the same list, so a listed frontend can also sign in and out when its requests carry
cookies. Its own base URL (`BETTER_AUTH_URL`) is always trusted. An origin in neither place gets a `403` with
the code `invalid_origin` on those requests.

The list also covers writes. A write to `/api/*` that carries a session cookie must come from a listed origin
(or the base URL), or it gets `403` with the code `origin_not_allowed`. Requests with a bearer token are not
affected.

> **Upgrading an existing `.env`:** `BETTER_AUTH_URL` used to be `http://localhost:3000`. To call the API from a
> browser at `http://api.chinook.localhost`, set it to that address (or list the origin in `CORS_ORIGINS`).
> curl sends no `Origin` header, so it works either way. Insomnia needs one once it holds a session cookie; see
> [docs/guides/INSOMNIA.md](docs/guides/INSOMNIA.md).

---

### Run with Docker Compose

`docker-compose.yml` starts:

1. **PostgreSQL**, loaded with the Chinook data, from my published image
   [`builtnoble/chinook-postgres:1`](https://github.com/builtnoble/chinook-postgres)
2. The **compiled API**
3. The **docs site**, a published image (`builtnoble/chinook-docs`) with the API reference and guides
4. A small **Caddy proxy** that gives the API and the docs a hostname each

```sh
docker compose up -d --build
```

| What          | Through the proxy                                          | Directly                                      |
| ------------- | ---------------------------------------------------------- | --------------------------------------------- |
| API           | [http://api.chinook.localhost](http://api.chinook.localhost) | [http://localhost:3000](http://localhost:3000) |
| API docs      | [http://docs.chinook.localhost](http://docs.chinook.localhost) | [http://localhost:3001](http://localhost:3001) |

Browsers and curl send `*.localhost` names to your own machine, so there is nothing to add to a hosts file. The
proxy listens on port 80. If that is taken, set `PROXY_PORT` and add the port to the URLs
(`http://api.chinook.localhost:8080`).

The first time, create the Better Auth tables:

```sh
bun install
cd api
bunx drizzle-kit migrate
```

#### Data persistence and resetting

The database lives in the `chinook-data` volume, so changes (including accounts) survive
`docker compose down`. The Chinook data is only loaded into an empty volume, so pulling a newer image does not
change data that already exists.

To get back to the original Chinook data:

```sh
# In place: restores the Chinook tables and leaves the auth tables alone
docker compose exec db chinook-reset

# Or discard the volume; the data is loaded again on the next `up`
docker compose down -v
(cd api && bunx drizzle-kit migrate)   # recreates the auth tables
```

In the database, deleting a playlist, track or invoice also deletes its `playlist_tracks` or `invoice_lines`
rows. Deleting an artist that still has albums, or a track that is on an invoice line, fails with a foreign key
error. The API avoids that for tracks by soft-deleting them: it sets `tracks.deleted_at`, a column the image
adds. A database made from an older image gets the column from the first `drizzle-kit migrate`.

---

### Create an admin

Once the database is running and migrated, create the first admin:

```sh
cd api
bun run create-admin --email admin@example.com --name "Admin"
```

It asks for a password. Passing `--password` skips the question but leaves the password in your shell
history. If any users already exist it asks `Create an admin user anyway?`; answer `y`, or pass `--yes`. The new
account has a verified email, so you can sign in with it straight away (see
[docs/guides/INSOMNIA.md](docs/guides/INSOMNIA.md)). For an email that already has an account it fails with
`User already exists`.

The API does not need to be running. The script runs the
[Better Auth CLI](https://www.better-auth.com/docs/concepts/cli) (`auth create-admin`) from the repository
root, against `api/src/auth/index.ts`, and reads the database from the `.env` in the repository root. Other
options, such as `--role` and `--no-email-verified`, can be added to the command. The CLI version is set in the
script, because `create-admin` needs version 1.7 or later.

Accounts live in the database volume, so `docker compose down -v` removes the admin along with everything else.
Run the migrations and `create-admin` again after it.

---

## Upgrading from 1.0

Version 1.1 changes some responses. A `GET` of an unknown or deleted id now answers `404` instead of `200`
with no `data`. Every error is now a problem document with a `code`, in place of the old `error` and `message`
bodies. Run `bun install` at the root, `bunx drizzle-kit migrate` in `api/`, and create an admin if you need to
write. The full list is in [CHANGELOG.md](CHANGELOG.md).

---

## Example Endpoints

Authenticated endpoints need a valid token or session. The
[Insomnia guide](docs/guides/INSOMNIA.md) (also on the docs site) walks through creating an account, signing in
and calling every endpoint.

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

Writes need an admin. This creates an artist and answers `201` with the new record:

```
POST /api/artists
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{ "name": "Example Artist" }
```

`PATCH /api/artists/{id}` changes an artist and `DELETE /api/artists/{id}` removes it. Artists, albums, genres,
media types and tracks are hidden rather than erased when deleted, and `?cascade=true` also deletes what
depends on an artist or album. Playlists have the same three routes, and a playlist's tracks are added and
removed with `POST /api/playlists/{id}/tracks` and `DELETE /api/playlists/{id}/tracks/{track_id}`. The details
are in [docs/INTRODUCTION.md](docs/INTRODUCTION.md#writing-data).

---

## Errors

Every error is a problem document ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)) with the content type
`application/problem+json`. Match on `code`, which is stable, and show `detail` to a person:

```
{
	"type": "about:blank",
	"title": "Not Found",
	"status": 404,
	"detail": "Artist not found.",
	"code": "not_found"
}
```

A request that fails validation also has an `errors` list with one entry for every issue. The format and every
code are in [docs/INTRODUCTION.md](docs/INTRODUCTION.md#errors). Errors from `/api/auth/*` use the same
document, with Better Auth's code in lower case.

---

## API Docs Site

The docs site has the guides and a reference page for every resource, built from the API's own
`/openapi.json`. It is published as a Docker image,
[`builtnoble/chinook-docs`](https://hub.docker.com/r/builtnoble/chinook-docs), and `docker compose up` pulls and
starts it as the `docs` service. Once the stack is up it is at
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

The image is a static site served by nginx. It does not need the API or the database, so you can also run it
on its own:

```sh
docker run --rm -p 3001:8080 builtnoble/chinook-docs:edge
```

Images are published for `amd64` and `arm64`. The site only shows what has been published. To change a page, or
to preview a change before it is published, see [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md#documentation).

---

## Contributing

Setting up the API for local development, linting, tests, commit conventions and working on the docs are in
[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).

---

## License

The code and documents in this repository are released under the [MIT License](LICENSE).

The Chinook table definitions mirror the [Chinook database](https://github.com/lerocha/chinook-database) by
Luis Rocha, also MIT-licensed; its notice is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The design of
the published docs image comes from a Tailwind Plus template that is licensed separately and is not part of this
repository. The image lists the open-source libraries it bundles at `/third-party-licenses.txt`, which also
covers the licenses of the npm dependencies and base images.
