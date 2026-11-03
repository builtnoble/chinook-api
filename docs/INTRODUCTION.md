# Introduction

## What it is

Chinook API is a REST API for the Chinook sample dataset (artists, albums, tracks, genres, playlists,
media types, invoices, customers and employees). It is a testing ground for frontend work, and an
example of how quickly a typed, signed-in API can be built with modern TypeScript tools.

The database holds all of those tables, but only albums, artists, genres, media types, playlists and
tracks have routes so far, and every route is a read-only `GET`. Write and delete routes are still to
come. The database itself accepts writes.

What it aims for:

- **Types from the database to the JSON response**, with no copies to keep in sync.
- **A quick local start.** `bun run dev` and `docker compose up` give a working API with the data
  loaded.
- **A small production image.** The app compiles to a single binary, so the image needs no Node.js,
  Bun or `node_modules`.
- **Consistent conventions.** Names are snake_case, like the Chinook SQL. Pagination is predictable.
  The OpenAPI docs come from the same schemas that check requests.

It is not a production system of record. There is no rate limiting or caching, and the data is mostly
read-only reference data with a thin sign-in layer on top.

## How it fits together

```
Client
  │
  ▼
Hono app (api/src/index.ts)
  ├─ CORS middleware (per-request; allowed origins from CORS_ORIGINS)
  ├─ /health                         → liveness check
  ├─ /openapi.json                   → generated from route schemas
  ├─ /api/auth/*                     → delegated to Better Auth
  ├─ errors and unknown routes       → problem documents (api/src/handlers/errorHandler.ts)
  └─ /api/*  (api/src/api.ts)
        ├─ snakeCaseKeysMiddleware   → rewrites outgoing JSON keys to snake_case
        ├─ authMiddleware            → verifies session, 401s if absent
        └─ route modules             → albums, artists, genres, media-types, playlists, tracks
              ├─ validate(query/param/json) → Zod schemas (api/src/utils/schema/)
              ├─ paginationMiddleware     → page/limit → offset, prev/next URLs
              └─ Drizzle query            → api/src/db (chinook and auth schemas)
                                                │
                                                ▼
                                         PostgreSQL (Chinook dataset)
```

It is built with:

| Layer | Tool | Used for |
|---|---|---|
| Runtime | Bun | Runs TypeScript, and compiles the app to a single binary for production |
| HTTP framework | Hono | Routes and middleware |
| Database access | Drizzle | Typed queries; maps camelCase fields to snake_case columns |
| Sign-in | Better Auth | Email and password accounts, stored in the same Postgres database |
| Validation and docs | Zod and hono-openapi | One set of schemas checks requests and produces `/openapi.json` |
| Database | PostgreSQL, from the `builtnoble/chinook-postgres:1` image | The Chinook data is loaded when the image starts, so `docker compose up` gives a ready database. A named volume keeps the data between runs |

The compose stack has four services: `db` (the Postgres image), `app` (the compiled API), `docs` (the
published docs site) and `proxy` (Caddy). The proxy serves the API at `api.chinook.localhost` and the
docs at `docs.chinook.localhost`. Browsers and curl send `*.localhost` to your own machine, so the two
act as separate origins with no changes to your hosts file. The API and the docs are also available on
their own ports, `3000` and `3001`.

## How a request is handled

Take `GET /api/tracks`:

1. CORS is applied, and the request goes to the `/api` routes.
2. The sign-in check reads the session from the request. With no valid session the answer is `401`,
   before any route code runs.
3. The route checks the query and path against its Zod schema. A bad request gets a problem document
   that lists every issue (see Errors).
4. A list route then checks the page and limit against the number of rows, and answers `400` if the
   page is out of range. Soft-deleted rows (rows with a `deleted_at` value) are not counted.
5. The route reads the rows and their related rows (a track's album, artist, genre and media type) in
   one query. Tracks, albums, artists, genres and media types skip soft-deleted rows and never return
   `deleted_at`.
6. The response body is rewritten with snake_case keys before it is sent.

**Sign-in.** Better Auth keeps its own tables (`users`, `sessions`, `accounts` and `verifications`,
in `api/src/db/authSchema.ts`) next to the Chinook tables, in the same database. `/api/auth/*` goes
straight to Better Auth, so those endpoints need no sign-in, while everything under `/api/*` needs a
valid bearer session. Successful `/api/auth/*` responses keep Better Auth's camelCase keys. Failures
are rewritten as problem documents that copy only the message and the code, because Better Auth can
attach a raw error, such as a failing SQL statement with its values, and that must not reach the client.

**Other origins.** A frontend on another origin is allowed by listing it in `CORS_ORIGINS`, separated
by commas. The same list sets Better Auth's trusted origins, which also always include its own base
URL (`BETTER_AUTH_URL`). An origin that is not listed gets no CORS headers, and its cookie requests to
`/api/auth/*` get a `403` with the code `invalid_origin`.

**OpenAPI and the docs site.** `/openapi.json` is generated from the same route definitions and Zod
schemas that check requests, so the docs match the code. The docs site is built from it:
`bun run openapi:export` (in `api/`) writes the document without a database or a running server, and
the generator in `docs-site/` turns it into one reference page per tag. Every route therefore needs a
tag, a summary and a description, which `api/tests/openapiDocument.test.ts` checks. The Introduction
and the guide come from the Markdown in `docs/`, which can only use what MDX accepts (no HTML
comments).

**The database image.** The Postgres image (`builtnoble/chinook-postgres`, pinned to the `1` release
line in `docker-compose.yml`) creates and loads the Chinook tables. Drizzle Kit (`api/drizzle/`, config
in `api/drizzle.config.ts`) only manages what the API adds:

- `0000` is a commented-out baseline of the Chinook tables. It is never run.
- `0001` creates the Better Auth tables.
- `0002` makes three foreign keys cascade on delete, as they do in the current image (`invoice_lines`
  to `invoices`, and `playlist_tracks` to `playlists` and `tracks`). It only changes databases made
  from the image before 1.0.
- `0003` adds `tracks.deleted_at`. Deleting a track sets it and keeps the row, so invoice lines still
  point at a real track. Image 1.1 and later create the column themselves, so `0003` only changes
  databases made from an older image.

`api/src/db/chinookSchema.ts` mirrors the image's `init.sql`. If the two drift apart, the next
`drizzle-kit generate` proposes the difference as a migration, so check it against the image before
you apply it.

The `app` service waits for the image's healthcheck. The data lives in the `chinook-data` volume and
is only loaded into an empty volume, so pulling a newer image does not change existing data until you
run `docker compose down -v`.

## Errors

Every error the API sends is a problem document ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457))
with the content type `application/problem+json`, so a client can handle every failure the same way:

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Artist not found.",
  "code": "not_found"
}
```

- `status` repeats the HTTP status, and `title` is its name.
- `detail` explains this case in words meant for a person. Do not match on it.
- `code` is a stable, machine-readable name. Branch on `code`.
- `type` is always `about:blank`, which in RFC 9457 means the problem has no meaning beyond its status.
  It is a name and not a link, so nothing is fetched from it.

A request that fails validation also has `errors`, with one entry for every issue found. `field` is a
[JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) to the offending value, and `in` says which part
of the request it is in (`body`, `path` or `query`):

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "The request is not valid.",
  "code": "validation_failed",
  "errors": [
    { "field": "/name", "in": "body", "message": "Invalid input: expected string, received number", "code": "invalid_type" },
    { "field": "/colour", "in": "body", "message": "Unrecognized key: \"colour\"", "code": "unrecognized_keys" }
  ]
}
```

| `code` | Status | When |
| --- | --- | --- |
| `validation_failed` | `400` | The query, the path or the body is not valid; `errors` lists every issue |
| `bad_request` | `400` | The body is not valid JSON |
| `page_out_of_range` | `400` | `page` is beyond the last page |
| `limit_out_of_range` | `400` | `limit` is larger than the number of items |
| `unauthorized` | `401` | There is no session, or it is not valid |
| `forbidden` | `403` | A write by a signed-in user who is not an admin |
| `origin_not_allowed` | `403` | A cookie write from an origin that is not allowed |
| `not_found` | `404` | No such route, or no item with that id, or it was deleted |
| `duplicate_value` | `409` | A unique value collides with an existing row, or the track is already in the playlist |
| `delete_blocked` | `409` | The item still has albums or tracks, and `cascade=true` was not passed |
| `content_too_large` | `413` | The body is over 100 KB, whether or not the request declares its length |
| `invalid_reference` | `422` | A field refers to a parent that does not exist or is deleted |
| `value_too_long` | `422` | A value is too long for its column |
| `internal_server_error` | `500` | Something failed on the server |

A `401` also carries a `WWW-Authenticate` header, as HTTP requires. It names the scheme, `Bearer`, and
adds `error="invalid_token"` when a bearer token was sent and failed. The header is exposed over CORS,
so a browser frontend on a listed origin can read it.

A `500` never says what failed. Its `detail` is always `An unexpected error occurred.`, and the cause is
logged on the server.

Errors from `/api/auth/*` are Better Auth's, rewritten into the same document. Its `message` is the
`detail`, and its code, in lower case, is the `code`: `invalid_email_or_password`,
`user_already_exists_use_another_email`, `password_too_short`, `missing_or_null_origin`,
`invalid_origin` and the like. Its `VALIDATION_ERROR` becomes `validation_failed`, as everywhere else,
but without an `errors` list; the `detail` says what was wrong.

The code for all of this is in `api/src/lib/problem-details/`, which has its own README.
