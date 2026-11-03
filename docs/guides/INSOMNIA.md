# Testing the API with Insomnia

How to create an account and call the Chinook API from [Insomnia](https://insomnia.rest). Written for
Insomnia 13.x; menu names can differ a little in other versions.

## 1. Start the API

```sh
docker compose up -d --build   # the Chinook database, the API, the docs site and the proxy
bun install && (cd api && bunx drizzle-kit migrate)   # first run only: installs and creates the auth tables
```

The API is then at `http://api.chinook.localhost` (through the proxy) and at `http://localhost:3000`
(directly). The `.localhost` names point at your own machine, so there is nothing to set up. If port 80
is taken, set `PROXY_PORT` in `.env` and add the port to the address, or use `http://localhost:3000`
throughout.

Check it is up: `curl http://api.chinook.localhost/health` returns
`{"status":"ok","message":"API healthy"}`.

To run the API from source instead, start only the database and run the server on your machine. It
listens on `http://localhost:3000`:

```sh
docker compose up -d db
cd api && bun run dev
```

If the `app` container is running, stop it first (`docker compose stop app`), because it also uses
port 3000.

## 2. Set up Insomnia

### Environment

Create a base environment with the API's address:

```json
{
  "base_url": "http://api.chinook.localhost"
}
```

Use `http://localhost:3000` instead if you run the API from source.

Use it in request URLs as `{{ _.base_url }}`. In any text field, `Control+Space` lists the variables
to pick from.

### Send an `Origin` header with the auth requests

The auth routes reject a `POST` that has a cookie but no `Origin` header, with `403` and the `code`
`missing_or_null_origin`. Writes to the data routes (`POST`, `PATCH` and `DELETE`) have a similar rule: with
a cookie and no allowed `Origin`, they get `403` with the `code` `origin_not_allowed`. Insomnia keeps the
session cookie from sign-up and sends it on every later request, but it sends no `Origin`, so these fail
unless you add one. Create a folder for the auth requests (sign-up, sign-in, sign-out) and another for the
writes, and add this in each folder's **Headers**:

| Header | Value |
| --- | --- |
| `Origin` | `{{ _.base_url }}` |

The API always trusts its own base URL (`BETTER_AUTH_URL` in `.env`), so this passes as long as
`base_url` matches it. Requests without a cookie, such as the first sign-up, work either way, and so do
requests that send a bearer token (see [Authenticate requests](#5-authenticate-requests)).

### Import the data endpoints (optional)

Importing `http://api.chinook.localhost/openapi.json` creates a request for each of the 32 data routes:
the reads and the writes for albums, artists, genres, media types, playlists and tracks, and adding and
removing a playlist's tracks. Imported
requests use the spec's server URL, `http://api.chinook.localhost`, and not your environment variable.
`/api/auth/*` is not included, so create those requests by hand. If the imported requests return `401`,
set the auth yourself as in [Authenticate requests](#5-authenticate-requests).

## 3. Create an account

`POST {{ _.base_url }}/api/auth/sign-up/email` with a JSON body:

```json
{
  "name": "Your Name",
  "email": "you@example.com",
  "password": "at-least-8-characters"
}
```

Always send `name`. Passwords must be 8 to 128 characters.

A successful sign-up returns `200` and signs you in:

```json
{
  "token": "…32 characters…",
  "user": {
    "id": "…",
    "email": "you@example.com",
    "name": "Your Name",
    "image": null,
    "emailVerified": false,
    "createdAt": "2026-10-27T18:15:02.082Z",
    "updatedAt": "2026-10-27T18:15:02.082Z",
    "role": "user",
    "banned": false,
    "banReason": null,
    "banExpires": null
  }
}
```

The response headers include `set-auth-token` (the session token) and
`set-cookie: better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`. Sessions
last 7 days.

These failures are problem documents, like the errors of the data routes (see
[Errors](../INTRODUCTION.md#errors)).

| Case | Status | `code` | `detail` |
| --- | --- | --- | --- |
| Password shorter than 8 | `400` | `password_too_short` | Password too short |
| Email already registered | `422` | `user_already_exists_use_another_email` | User already exists. Use another email. |
| `name` missing | `400` | `validation_failed` | [body.name] Invalid input: expected string, received undefined |

### Create an admin account

An account made with the request above is an ordinary user. It can read every route, but a write
(`POST`, `PATCH` or `DELETE`) returns `403` with the `detail` `This action requires the admin role.`.
To send writes, create an admin from the command line instead of signing up:

```sh
cd api && bun run create-admin --email admin@example.com --name "Admin"
```

It asks for a password (passing `--password` leaves it in your shell history) and, if any users
already exist, asks `Create an admin user anyway?`; answer `y` or pass `--yes`. The database must be
running and migrated, but the API does not need to be. Skip the sign-up request and go to step 4: sign
in with that email and password.

## 4. Sign in

`POST {{ _.base_url }}/api/auth/sign-in/email` with a JSON body:

```json
{
  "email": "you@example.com",
  "password": "at-least-8-characters"
}
```

Returns `200` with `{"redirect":false,"token":"…","user":{…}}` and the same `set-auth-token` header
and cookie as sign-up. A wrong password and an unknown email both return `401`:

```json
{
  "type": "about:blank",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Invalid email or password",
  "code": "invalid_email_or_password"
}
```

## 5. Authenticate requests

Every `/api/*` data route needs a session. `/health`, `/openapi.json` and `/api/auth/*` do not. Either
of these works:

**Cookie (nothing to set up).** Sign-up and sign-in set the `better-auth.session_token` cookie.
Insomnia keeps the cookies it receives and sends them on later requests to the same host, so once you
have signed in, the data requests are authenticated automatically.

**Bearer token.** On a request, folder or collection, set Auth to *Bearer Token* and use either:

- the `token` field of the sign-up or sign-in response body (32 characters), or
- the `set-auth-token` response header (a longer, URL-encoded value).

To avoid pasting the token after every sign-in, set the token field to the `token` attribute of the
sign-in request's last response, using Insomnia's response tags.

## 6. Call the endpoints

### Read data

Any signed-in user can read.

| Route | Notes |
| --- | --- |
| `GET /api/artists`, `/api/artists/{id}` | 275 artists |
| `GET /api/albums`, `/api/albums/{id}` | 347 albums; each includes its `artist` |
| `GET /api/genres`, `/api/genres/{id}` | 25 genres |
| `GET /api/media-types`, `/api/media-types/{id}` | 5 media types |
| `GET /api/playlists`, `/api/playlists/{id}` | 18 playlists |
| `GET /api/tracks`, `/api/tracks/{id}` | 3503 tracks; each includes `album` (with its `artist`), `genre` and `media_type` |

List routes take `page` and `limit` query parameters. With no `limit` you get 10 rows (fewer if the
table is smaller). Keys in responses are snake_case.

```http
GET {{ _.base_url }}/api/artists?limit=2
```

```json
{
  "data": [
    { "id": 1, "name": "AC/DC" },
    { "id": 2, "name": "Accept" }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 2,
    "total_items": 275,
    "total_pages": 138,
    "prev_page_url": null,
    "next_page_url": "/api/artists?page=2"
  }
}
```

Single records come back as `{ "data": { … } }`.

### Create, change and delete data

Writes need an admin. A signed-in ordinary user gets `403` (see
[Create an admin account](#create-an-admin-account)). Send a JSON body with the `Content-Type:
application/json` header, and the `Origin` header from step 2 if you rely on the cookie.

| Route | Body |
| --- | --- |
| `POST /api/artists` | `name` |
| `POST /api/albums` | `title`, `artist_id` |
| `POST /api/genres`, `/api/media-types`, `/api/playlists` | `name` |
| `POST /api/tracks` | `name`, `media_type_id`, `milliseconds` and `unit_price` (a string such as `"0.99"`), and optionally `album_id`, `genre_id`, `composer` and `bytes` |
| `PATCH /api/{resource}/{id}` | Any of the fields above, but at least one |
| `DELETE /api/{resource}/{id}` | None. Add `?cascade=true` for an artist or album that still has albums or tracks |
| `POST /api/playlists/{id}/tracks` | `track_id` |
| `DELETE /api/playlists/{id}/tracks/{track_id}` | None |

A create returns `201`, and an update or delete returns `200`. Each returns the record as `{ "data": … }`,
in the same shape as a read. A delete returns the record that was removed.

```http
POST {{ _.base_url }}/api/artists
```

```json
{ "name": "Example Artist" }
```

```json
{ "data": { "id": 276, "name": "Example Artist" } }
```

The `id` is whatever comes next in your database. Change the artist, then delete it:

```http
PATCH {{ _.base_url }}/api/artists/276
```

```json
{ "name": "Renamed Artist" }
```

```http
DELETE {{ _.base_url }}/api/artists/276
```

After the delete, `GET {{ _.base_url }}/api/artists/276` returns `404`: deleting an artist, album, genre,
media type or track keeps the row but hides it, so lists, counts and reads no longer include it. Playlists
are removed for good, along with their list of tracks, and the tracks themselves are not touched.

### Errors

Errors are problem documents with the content type `application/problem+json`: a `status`, a `title`,
a `detail` that explains this case, and a `code` to match on. See [Errors](../INTRODUCTION.md#errors)
for the format and every code.

| Request | Status | `code` | `detail` |
| --- | --- | --- | --- |
| Any data route without a session, or after signing out | `401` | `unauthorized` | Missing or invalid credentials. |
| `?page=` beyond the last page | `400` | `page_out_of_range` | Page cannot exceed 28. |
| `?limit=` larger than the table | `400` | `limit_out_of_range` | Limit cannot exceed 25. |
| Non-numeric id, e.g. `/api/artists/abc` | `400` | `validation_failed` | The request is not valid. |
| An id that does not exist, or a deleted row | `404` | `not_found` | Artist not found. |
| A write by a signed-in user who is not an admin | `403` | `forbidden` | This action requires the admin role. |
| A cookie write without an allowed `Origin` | `403` | `origin_not_allowed` | The request comes from an origin that is not allowed. |
| A body that is not valid JSON | `400` | `bad_request` | Malformed JSON in request body |
| A body over 100 KB | `413` | `content_too_large` | The request body is too large. |
| A parent that does not exist or is deleted, e.g. an unknown `artist_id` | `422` | `invalid_reference` | The row refers to a parent that does not exist. |
| Adding a track that is already in the playlist | `409` | `duplicate_value` | A row with that value already exists. |
| Deleting an artist that still has albums | `409` | `delete_blocked` | The artist has 2 albums. Delete them first, or pass cascade=true. |

A missing id is a `404`, not a `200` with an empty result, and the `detail` names the resource. For the
non-numeric id, the `errors` list in the same document says which value was wrong:
`"field": "/id", "in": "path"`.

## 7. Sign out

`POST {{ _.base_url }}/api/auth/sign-out` with `{}` as the JSON body, your session attached (cookie or
bearer token), and the `Origin` header from step 2. It returns `200` `{"success":true}`, and the token
stops working: the next data request is a `401`.

## Troubleshooting

- **`500` on sign-up or sign-in.** The API cannot reach the database (`docker compose ps` should show
  `db` as healthy), or the auth tables do not exist yet. Run `bunx drizzle-kit migrate`.
- **`401` on data routes.** You are not signed in, you signed out, or the session expired (7 days).
- **Port 3000 already in use.** If you run the API with `bun run dev`, stop the `app` container first
  (`docker compose stop app`).
- **`api.chinook.localhost` does not resolve, or port 80 is in use.** Most systems send `*.localhost`
  to the local machine by themselves. If yours does not, or the proxy cannot use port 80, use
  `http://localhost:3000` (and set `base_url` to match), or set `PROXY_PORT` in `.env` and put that
  port in the address.
- **`403` `missing_or_null_origin` on sign-in or sign-out.** The request had the session cookie but no
  `Origin` header. Add the header as in [Send an `Origin` header](#send-an-origin-header-with-the-auth-requests),
  or delete the saved cookies for the host in Insomnia's cookie manager and send the request again.
- **`403` `origin_not_allowed` on a write.** The request had the session cookie but no `Origin` that the API
  trusts. Add the `Origin` header as in [Send an `Origin` header](#send-an-origin-header-with-the-auth-requests),
  or authenticate with a bearer token, which needs no `Origin`.
- **`409` `delete_blocked`.** The artist or album still has albums or tracks. Delete them first, or add
  `?cascade=true` to the delete. A genre or media type that tracks still use cannot be deleted until those tracks
  are changed or deleted.
- **`403` `invalid_origin`.** The `Origin` is not one the API trusts. The trusted origins are
  `CORS_ORIGINS` and the base URL (`BETTER_AUTH_URL` in `.env`). A browser request from
  `http://api.chinook.localhost` gets this unless `BETTER_AUTH_URL` is that address (older copies of
  `.env` have `http://localhost:3000`). See the README for setting up a frontend.
- **`403` `This action requires the admin role.`** You are signed in as an ordinary user. Create an
  admin as in [Create an admin account](#create-an-admin-account) and sign in with it.
- **`create-admin` says `Failed to inspect existing users`.** It cannot reach the database, or the auth
  tables do not exist yet, which are the same causes as the `500` above. Check that `db` is healthy and
  run `bunx drizzle-kit migrate`.
- **`create-admin` says `User already exists`.** That email already has an account. Use another email,
  or sign in with the existing account.
- **`create-admin` says `Cannot find module '@/db'`.** The command was run from the wrong directory
  (use `bun run create-admin` in `api/`), and it saved its failed attempt. Delete `jiti` from your
  temporary directory (`$TMPDIR/jiti`, or `/tmp/jiti` if `TMPDIR` is not set) and run it again.
- **Start over.** `docker compose down -v` deletes the database volume, accounts included, and loads
  the data again on the next start. Then run the migrations and `create-admin` again.

## The same requests with curl

```sh
curl -X POST http://api.chinook.localhost/api/auth/sign-up/email -H 'Content-Type: application/json' \
  -d '{"name":"Your Name","email":"you@example.com","password":"at-least-8-characters"}'

curl -X POST http://api.chinook.localhost/api/auth/sign-in/email -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"at-least-8-characters"}'

curl 'http://api.chinook.localhost/api/artists?limit=2' -H 'Authorization: Bearer <token>'

# as an admin
curl -X POST http://api.chinook.localhost/api/artists -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' -d '{"name":"Example Artist"}'

curl -X POST http://api.chinook.localhost/api/auth/sign-out -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' -d '{}'
```
