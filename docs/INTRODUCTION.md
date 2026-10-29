# Introduction

## Context and goals

Chinook API is a REST backend for the classic Chinook sample dataset (artists, albums, tracks,
genres, playlists, media types, invoices, customers, employees). Its stated purpose is to serve
as a **testing ground for frontend experimentation** while also demonstrating how quickly a
type-safe, authenticated API can be built with modern TypeScript tooling.

The schema covers all of those tables, but only albums, artists, genres, media types, playlists and
tracks have routes so far, and every route is a read-only `GET`. The database itself accepts writes.

Goals that shaped the design:

- **Type safety end to end** — from database rows through to JSON responses, with no manual
  type duplication.
- **Fast local iteration** — a single `bun run dev` and `docker compose up` should be enough to
  get a working API with data preloaded.
- **Small footprint in production** — the app compiles to a single self-contained binary, so the
  production image needs no runtime (no Node.js, no Bun, no node_modules).
- **Consistent API conventions** — snake_case over the wire (matching the Chinook dataset's SQL
  naming), predictable pagination, and OpenAPI docs generated from the same schemas that validate
  requests.

Non-goals: this is not a production system of record. There's no rate limiting, caching layer,
or write-heavy transaction handling — the dataset is effectively read-mostly reference data plus
a thin auth layer bolted on top.

## High-level design

```
Client
  │
  ▼
Hono app (api/src/index.ts)
  ├─ CORS middleware (per-request; allowed origins from CORS_ORIGINS)
  ├─ /health                         → liveness check
  ├─ /openapi.json                   → generated from route schemas
  ├─ /api/auth/*                     → delegated to Better Auth
  └─ /api/*  (api/src/api.ts)
        ├─ snakeCaseKeysMiddleware   → rewrites outgoing JSON keys to snake_case
        ├─ authMiddleware            → verifies session, 401s if absent
        └─ route modules             → albums, artists, genres, media-types, playlists, tracks
              ├─ validator(query/param)   → Zod schemas (api/src/utils/schema/index.ts)
              ├─ paginationMiddleware     → page/limit → offset, prev/next URLs
              └─ Drizzle query            → api/src/db (schema.ts + relations.ts)
                                                │
                                                ▼
                                         PostgreSQL (Chinook dataset)
```

Runtime and framework choices:

| Layer | Choice | Why |
|---|---|---|
| Runtime | Bun | Native TypeScript, fast startup, compiles to a standalone binary for prod |
| HTTP framework | Hono | Small, typed, first-class middleware model, plays well with `hono-openapi` |
| ORM | Drizzle | Schema-as-code with inferred types; `casing: 'snake_case'` maps camelCase JS fields to snake_case columns without manual mapping |
| Auth | Better Auth | Email/password auth with a Drizzle adapter — reuses the same Postgres connection and schema conventions as the rest of the app |
| Validation / docs | Zod + hono-openapi | Route schemas double as request validators and as the source for the generated `/openapi.json` |
| Database | PostgreSQL, preloaded via a custom Docker image (`builtnoble/chinook-postgres:1`) | Chinook ships as SQL; baking it into an image means `docker compose up` yields a populated database with no separate seed step. The image has a healthcheck that the app waits on, and a named volume keeps the data between runs |

## Data flow and integration points

**Request path (e.g. `GET /api/tracks`):**

1. `index.ts` applies CORS, then hands off to the `/api` sub-app.
2. `snakeCaseKeysMiddleware` runs first in the chain but does its work *after* `next()` — it
   rewrites the outgoing response body, not the incoming request. This lets route handlers use
   normal camelCase JS objects (via Drizzle's `casing: 'snake_case'` mapping) while the wire
   format matches Chinook's original snake_case columns.
3. `authMiddleware` calls `auth.api.getSession()` (Better Auth) against the request headers. No
   session → `401` before any route code runs. On success, `user`/`session` are set as Hono
   context variables for downstream handlers.
4. The matched route (e.g. `api/src/routes/tracks.ts`) validates `query`/`param` input with a shared
   Zod schema (`api/src/utils/schema/index.ts`), then, for list endpoints, runs `paginationMiddleware`.
5. `paginationMiddleware` does a `db.$count()` against the target table, derives
   `currentPage` / `perPage` / `offset`, and rejects out-of-range pages with `400` before the
   main query runs.
6. The route handler queries Drizzle's relational query builder (`db.query.tracks.findMany`),
   eager-loading related rows (`album.artist`, `genre`, `media_type`) in one round trip via the
   relations defined in `api/src/db/relations.ts`.
7. Response flows back through `snakeCaseKeysMiddleware`, which re-serializes the JSON body with
   snake_case keys before it reaches the client.

**Auth integration:** Better Auth owns its own tables (`users`, `sessions`, `accounts`,
`verifications` in `api/src/db/schema.ts`) alongside the Chinook domain tables, sharing the same
Postgres pool (`api/src/db/index.ts`). `/api/auth/*` is routed directly to Better Auth's handler,
bypassing the `/api` sub-app entirely — so auth endpoints are unauthenticated by construction,
while everything under `/api/*` requires a valid bearer session. Because that route skips the `/api`
middleware, its responses keep Better Auth's camelCase keys, and its error responses pass through
`stripErrorDetails()` (`api/src/utils/helpers.ts`): Better Auth attaches the raw error, such as a failing SQL
statement with its values, as `details` to some failures, and that must not reach the client.

**Cross-origin browsers:** a frontend on another origin is allowed by listing it, comma-separated, in
`CORS_ORIGINS`. `getAllowedOrigins()` (`api/src/utils/helpers.ts`) parses that variable from the process
environment on every call, and two things consume it: the CORS middleware in `api/src/index.ts`, and Better
Auth's `trustedOrigins` in `api/src/utils/auth.ts`. Better Auth also always trusts its own base URL
(`BETTER_AUTH_URL`). An origin missing from both lists gets no CORS headers, and cookie-carrying requests
to `/api/auth/*` from it get `403 INVALID_ORIGIN`. The environment is read through `process.env` and not
Hono's `c.env`: under Bun, `c.env` is the server object, whereas on Cloudflare Workers it holds the
environment bindings.

**OpenAPI generation:** `/openapi.json` is generated at request time by `openAPIRouteHandler`
from the same `describeRoute` + Zod schema definitions attached to each route, so the docs cannot
drift from the actual validators.

**External dependency:** the Postgres image (`builtnoble/chinook-postgres`, pinned to the `1`
release line in `docker-compose.yml`) is the one piece of infrastructure not defined in this repo.
It creates and seeds the Chinook tables; Drizzle Kit (`api/drizzle/`, config in `api/drizzle.config.ts`)
only manages what the API adds on top:

- `0000` is a commented-out introspection baseline of the Chinook tables, kept so Drizzle's
  snapshots know about them. It is never run.
- `0001` creates the Better Auth tables.
- `0002` aligns three foreign keys with the image's cascading deletes (`invoice_lines` →
  `invoices`, `playlist_tracks` → `playlists` and `tracks`). It upgrades databases created from the
  pre-1.0 image and is a no-op on the current one.

The `app` service waits for the image's healthcheck (`depends_on: condition: service_healthy`).
Data lives in the `chinook-data` named volume. The seed only loads into an empty volume, so pulling a
newer image does not change existing data until `docker compose down -v`.

## Key decisions and trade-offs

- **Snake_case over the wire via middleware, not per-query mapping.** Centralizing the
  camelCase-to-snake_case conversion in one middleware keeps route handlers free of mapping code,
  but it does mean every JSON response is parsed and re-serialized once — acceptable for this
  dataset's size, worth revisiting if payloads grow large or streaming responses are ever needed.
- **Compiled binary for production, no Node.js runtime.** Shrinks the attack surface and image
  size, but ties deployment to Bun's `--compile` support — any dependency that relies on Node
  native addons would need to be re-evaluated.
- **Auth tables live in the same schema/connection as domain data.** Simple to operate (one
  database, one migration pipeline via Drizzle Kit), at the cost of coupling auth and domain data
  lifecycle — a schema reset for one affects the other.
- **Pagination validated against a live `COUNT(*)`.** Guarantees `400`s on invalid page numbers
  are always accurate, but adds a count query to every list request. Fine for Chinook-sized
  tables; would need a cached/estimated count for larger datasets.
- **Route-level Zod schemas double as OpenAPI source.** Avoids maintaining a separate OpenAPI
  spec by hand, but means validation logic and documentation are as accurate as the schemas
  authors write — there's no drift-detection beyond code review.
- **Foreign key rules are declared twice.** The image's `init.sql` is the source of truth for the
  Chinook tables, and `api/src/db/schema.ts` mirrors it so Drizzle's snapshots match the real database.
  If the two drift, the next `drizzle-kit generate` proposes the difference as a migration, so check
  that diff against the image before applying it.
- **One origin list drives both CORS and Better Auth.** Keeping them in step means a frontend only
  has to be listed once, but an origin that may call the API is also trusted for cookie-carrying auth
  requests; the two cannot be granted separately. Better Auth skips its origin check when
  `NODE_ENV=test`, so the tests in `api/src/index.test.ts` import the app under another value to exercise it.

## Where to look next

- [`api/src/db/schema.ts`](../api/src/db/schema.ts) / [`api/src/db/relations.ts`](../api/src/db/relations.ts) — full table and relationship definitions
- [`api/src/routes/`](../api/src/routes) — per-resource route handlers (albums, artists, genres, media-types,
  playlists, tracks all follow the same list/detail pattern shown above)
- [`api/src/utils/schema/index.ts`](../api/src/utils/schema/index.ts) — shared Zod schemas for query params, path params, and pagination
- [`api/src/index.test.ts`](../api/src/index.test.ts) — CORS and Better Auth origin tests, served through `Bun.serve` as in production (`bun test`)
- [`docker-compose.yml`](../docker-compose.yml) — the app and db services, the healthcheck dependency and the data volume
- [`README.md`](../README.md) — local setup, Docker Compose usage, and the full auth endpoint reference
