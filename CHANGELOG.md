# Changelog

## Unreleased

### New

-   **Search and filters on the list routes.** Every list route takes `q`, a case-insensitive text search of
    the name (a track's name, album title and artist; an album's title and artist). It is split into up to 5
    words, and every word has to be found. Albums take `artist_id`, and tracks take `album_id`, `genre_id` and
    `media_type_id`. `GET /api/playlists/{id}/tracks` takes the same filters as `GET /api/tracks`. The
    pagination counts the matching rows, and the page links keep the filters and the `limit`. See
    [docs/INTRODUCTION.md](docs/INTRODUCTION.md#searching-and-filtering).
-   **`GET /api/playlists/{id}/tracks`** lists the tracks in a playlist.

### Fixed

-   **A list with no rows** is one empty page, with `total_pages: 0` and no next link. It had `null` pages and a
    link to page 2.
-   **Lists are ordered by `id`** on every list route, so paging through them is stable.

## 1.1.0 (2026-11-03)

### Breaking changes

-   **An unknown id is now a `404`.** `GET /api/{resource}/{id}` used to answer `200` with no `data`. It now
    answers `404`, and so does the id of a deleted row.
-   **Errors are problem documents.** Every error is `application/problem+json` with a `type`, `title`, `status`,
    `detail` and `code` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)). The old bodies (`{ "error" }`,
    `{ "message" }` and the validation shape) are gone. Match on `code`. The codes are listed in
    [docs/INTRODUCTION.md](docs/INTRODUCTION.md#errors).
-   **Better Auth is now 1.7.** Signing up without a `name` answers `400` with the code `validation_failed`
    (it was `422`). The `user` object now has `role`, `banned`, `banReason` and `banExpires`.

### Upgrading

1. Run `bun install` at the repository root. `api/` and `docs-site/` are now workspaces.
2. Start the stack with `docker compose up -d --build`. A volume made from an older database image still
   works, because the migrations add what is missing.
3. Apply the migrations: `cd api && bunx drizzle-kit migrate`. They add the `deleted_at` columns and the
   columns for the admin role, and keep your data.
4. Create an admin with `bun run create-admin` (see the README). Writes need one.

### New

-   **Write routes.** Create, update and delete for artists, albums, genres, media types, playlists and tracks,
    and adding and removing a playlist's tracks. They need the `admin` role; a signed-in user without it gets
    `403`.
-   **The admin role.** Signing up always creates an ordinary user. The first admin is created with
    `bun run create-admin`, and Better Auth's admin endpoints are available under `/api/auth/admin/*`.
-   **Deleting hides the row.** Artists, albums, genres, media types and tracks are kept but no longer listed,
    counted or found. Playlists are removed for good. Add `?cascade=true` to delete what depends on an artist or
    album; without it a delete that would leave children behind is `409`.
-   **Limits on writes.** A body over 100 KB is `413`, and a write that sends a session cookie must come from an
    allowed origin (`403`, code `origin_not_allowed`). A `401` now carries a `WWW-Authenticate` header, and CORS
    allows `PATCH` and `DELETE`.
-   **Docs.** The reference pages and the guide cover the write routes. Request examples are shown in cURL,
    TypeScript and PHP, and `/openapi.json` describes every error response.

### Also changed

-   Better Auth is upgraded from 1.3.34 to 1.7.14, and Drizzle ORM from 0.44 to 0.45.
-   A request straight to the API port with no `X-Forwarded-For` header now shares one rate-limit count per path
    with every other such request. Requests through the proxy send that header and are not affected.
