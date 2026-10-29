# Testing the API with Insomnia

How to create an account and call the Chinook API from [Insomnia](https://insomnia.rest). Written for
Insomnia 13.x; menu names move around a little between versions.

> **Status:** the requests, bodies, headers and responses below were checked against a running API.
> The Insomnia-specific steps (importing, environments, chaining) have not been walked through end to end
> yet. If a label differs in your version, fix it here and delete this note.

## 1. Start the API

```sh
docker compose up -d --build   # the Chinook database and the API, on http://localhost:3000
bunx drizzle-kit migrate       # first run only: creates the auth tables
```

Check it is up: `curl localhost:3000/health` returns `{"status":"ok","message":"API healthy"}`.

To run the API from source instead, for example while changing it, start only the database and run the
server on your machine:

```sh
docker compose up -d db
bun run dev
```

If the `app` container is running, stop it first (`docker compose stop app`), because it also uses port 3000.

## 2. Set up Insomnia

### Environment

Create a base environment with the API's address:

```json
{
  "base_url": "http://localhost:3000"
}
```

Use it in request URLs as `{{ _.base_url }}`. In any text field, `Control+Space` opens a list of
variables to pick from, which inserts the exact syntax for your version.

### Import the data endpoints (optional)

The API publishes its own OpenAPI document at `http://localhost:3000/openapi.json`. Importing it from that
URL creates a request for each of the 12 data routes (a list and a by-id request for albums, artists,
genres, media types, playlists and tracks). Three things to know:

- Imported requests use the spec's own server URL, `http://localhost:3000`, not your environment variable.
- The spec declares no security scheme, so imported requests have no auth set. See
  [Authenticate requests](#5-authenticate-requests).
- It does not include `/api/auth/*`. Create those requests by hand (next sections).

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
    "updatedAt": "2026-10-27T18:15:02.082Z"
  }
}
```

The response headers include `set-auth-token` (the session token) and
`set-cookie: better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`. Sessions last
7 days.

| Case | Status | Body |
| --- | --- | --- |
| Password shorter than 8 | `400` | `{"code":"PASSWORD_TOO_SHORT","message":"Password too short"}` |
| Email already registered | `422` | `{"code":"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL","message":"User already exists. Use another email."}` |
| `name` missing | `422` | `{"code":"FAILED_TO_CREATE_USER","message":"Failed to create user"}` |

## 4. Sign in

`POST {{ _.base_url }}/api/auth/sign-in/email` with a JSON body:

```json
{
  "email": "you@example.com",
  "password": "at-least-8-characters"
}
```

Returns `200` with `{"redirect":false,"token":"…","user":{…}}` and the same `set-auth-token` header and
cookie as sign-up. A wrong password and an unknown email both return `401`:

```json
{ "code": "INVALID_EMAIL_OR_PASSWORD", "message": "Invalid email or password" }
```

## 5. Authenticate requests

Every `/api/*` data route needs a session. `/health`, `/openapi.json` and `/api/auth/*` do not. There are two
ways to send one; either works.

**Cookie (nothing to configure).** Sign-up and sign-in set the `better-auth.session_token` cookie. Insomnia
keeps the cookies it receives and sends them on later requests to the same host, so after you sign in,
the data requests are authenticated automatically.

**Bearer token.** On a request, folder or collection, set Auth to *Bearer Token* and use the session token:

- the `token` field of the sign-up or sign-in response body (32 characters), or
- the `set-auth-token` response header (a longer, URL-encoded signed value).

Both are accepted. To avoid pasting the token after every sign-in, set the token field to a value read from
the sign-in request's last response (the `token` attribute of its JSON body) with Insomnia's response
chaining.

## 6. Call the endpoints

| Route | Notes |
| --- | --- |
| `GET /api/artists`, `/api/artists/{id}` | 275 artists |
| `GET /api/albums`, `/api/albums/{id}` | 347 albums; each includes its `artist` |
| `GET /api/genres`, `/api/genres/{id}` | 25 genres |
| `GET /api/media-types`, `/api/media-types/{id}` | 5 media types |
| `GET /api/playlists`, `/api/playlists/{id}` | 18 playlists |
| `GET /api/tracks`, `/api/tracks/{id}` | 3503 tracks; each includes `album` (with its `artist`), `genre` and `media_type` |

List routes take `page` and `limit` query parameters; with no `limit` you get 10 rows (fewer if the table
is smaller). Keys in responses are snake_case.

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

### Errors

| Request | Status | Body |
| --- | --- | --- |
| Any data route without a session, or after signing out | `401` | `{"message":"Unauthorized"}` |
| `?page=` beyond the last page | `400` | `{"error":"Page cannot exceed 28."}` |
| `?limit=` larger than the table | `400` | `{"error":"Limit cannot exceed 25."}` |
| Non-numeric id, e.g. `/api/artists/abc` | `400` | `{"data":{"id":"abc"},"error":[…],"success":false}` |
| An id that does not exist | `200` | `{}` |

There are no `404`s: a missing id is a `200` with an empty result.

## 7. Sign out

`POST {{ _.base_url }}/api/auth/sign-out` with `{}` as the JSON body and your session attached (cookie or
Bearer token). Returns `200` `{"success":true}`, and the token stops working: the next data request is a
`401`.

## A suggested test run

1. Sign up (step 3), then sign in (step 4).
2. `GET /api/artists?limit=2`, then `GET /api/artists/1`.
3. `GET /api/tracks/1` and `GET /api/albums/1`, which both nest the record under `data`.
4. `GET /api/artists?page=9999` and `GET /api/artists/abc` for the error shapes.
5. Sign out, then repeat step 2 and confirm the `401`.

## Troubleshooting

- **`500` on sign-up or sign-in.** The API cannot reach the database (`docker compose ps` should show `db` as
  healthy), or the auth tables do not exist yet: run `bunx drizzle-kit migrate`.
- **`401` on data routes.** You are not signed in, the session was signed out, or the session expired
  (7 days).
- **Port 3000 already in use.** If you run the API with `bun run dev`, stop the `app` container first
  (`docker compose stop app`).
- **Browser origins.** `CORS_ORIGINS` and Better Auth's trusted origins only apply to requests that carry an
  `Origin` header, which means browsers. Insomnia is not a browser, so they do not affect it. See the
  README for configuring a frontend.
- **Start over.** `docker compose down -v` deletes the database volume, accounts included, and re-seeds on
  the next start (then run the migrations again).

## The same requests with curl

```sh
curl -X POST localhost:3000/api/auth/sign-up/email -H 'Content-Type: application/json' \
  -d '{"name":"Your Name","email":"you@example.com","password":"at-least-8-characters"}'

curl -X POST localhost:3000/api/auth/sign-in/email -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"at-least-8-characters"}'

curl 'localhost:3000/api/artists?limit=2' -H 'Authorization: Bearer <token>'

curl -X POST localhost:3000/api/auth/sign-out -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' -d '{}'
```
