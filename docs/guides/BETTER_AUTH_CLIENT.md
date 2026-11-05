# Using the Better Auth client

How to sign in to the Chinook API from a browser app with the
[Better Auth](https://www.better-auth.com) client, call the data routes, and show the errors the API
returns. The examples use TypeScript and `fetch`. The Vue client (`better-auth/vue`) is used the same way,
and the plain client (`better-auth/client`) works for any other framework.

The API is a Better Auth server with the email and password and the admin plugins, mounted at
`/api/auth`. The [Insomnia guide](./INSOMNIA.md) covers the same requests by hand, and the
[Errors](../INTRODUCTION.md#errors) section lists every error `code`.

## 1. Let the API trust your app

A browser app runs on its own origin, for example `http://localhost:5173`. The API only answers browsers
from origins it trusts, and those come from `CORS_ORIGINS` in `.env`:

```
CORS_ORIGINS=http://localhost:3000,http://localhost:8000,http://localhost:5173
```

That one list is the CORS allow list, Better Auth's trusted origins, and the origin check on writes.
Restart the API after you change it. If the API runs in Docker, recreate the container, because a running
container keeps the value it started with:

```sh
docker compose up -d --force-recreate app
```

Point the client at the API's direct address, `http://localhost:3000`, when your app runs on
`localhost`. The session lives in a cookie, and the cookie only comes back when the app and the API are on
the same host name. From a page on `http://localhost:5173`, signing in through
`http://api.chinook.localhost` succeeds, and the next data request returns `401`, because Chrome does not
send the cookie. The same calls to `http://localhost:3000` work.

Registering in the app creates an ordinary user, who can read but not write. For an admin, see
[Create an admin account](./INSOMNIA.md#create-an-admin-account).

## 2. Create the client

```ts
import { adminClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/client' // or 'better-auth/vue'

export const authClient = createAuthClient({
  baseURL: 'http://localhost:3000',
  // Send the session cookie with every request.
  fetchOptions: { credentials: 'include' },
  // Only here so TypeScript knows `user.role` exists.
  plugins: [adminClient()],
})
```

`credentials: 'include'` is required. Without it the browser drops the session cookie, and every sign-in
looks like it worked and then fails on the next request. Use the same `baseURL` for your data requests.

## 3. Sign up, sign in and sign out

```ts
const { data, error } = await authClient.signUp.email({
  name: 'Your Name',
  email: 'you@example.com',
  password: 'at-least-8-characters',
})

await authClient.signIn.email({ email: 'you@example.com', password: '…' })

await authClient.signOut()
```

Sign-up signs you in. The client does not throw when the API answers with an error. It returns
`{ data: null, error }`, so always check `error`.

Read the current session, and its role, with `authClient.getSession()`. With the Vue client,
`authClient.useSession()` returns a ref that updates when you sign in or out:

```ts
const session = authClient.useSession()
session.value.data?.user.role // 'user' or 'admin'
session.value.isPending // true until the first lookup finishes
```

Wait for `isPending` to turn `false` before a route guard decides whether someone is signed in, or a
signed-in user is bounced to the login page on every reload.

## 4. Call the data routes

Every `/api/*` data route needs the session, reads included. Plain `fetch` works, as long as it sends the
cookie:

```ts
const response = await fetch('http://localhost:3000/api/artists?limit=10', {
  credentials: 'include',
})
```

Send only the `Content-Type` header on requests with a body. The API's CORS rules allow `Content-Type`
and `Authorization`, and a browser rejects a request with any other header.

Writes need an admin. Show write controls only when `user.role === 'admin'`, and expect a `403` if
someone else gets past the UI.

## 5. Handle errors

Every error is a problem document (see [Errors](../INTRODUCTION.md#errors)), including the ones from
`/api/auth/*`, which the API rewrites into the same shape:

```json
{
  "type": "about:blank",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Invalid email or password",
  "code": "invalid_email_or_password"
}
```

`type` is always `about:blank`, so match on `code`.

### What the client gives you

When the API answers with an error, `error` is the problem document with `status` and `statusText` added
next to its fields, so `error.code`, `error.detail` and `error.status` are all there. When the request
gets no answer at all, nothing is returned: the client throws a `TypeError`. A normalising helper covers
both:

```ts
type Problem = {
  status: number
  title: string
  detail?: string
  code: string
  errors?: { field: string; in?: string; message: string }[]
}

function toProblem(error: unknown): Problem {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const { status, statusText, ...body } = error as Record<string, unknown>
    return {
      status: Number(status),
      title: String(body.title ?? statusText ?? 'Error'),
      detail: typeof body.detail === 'string' ? body.detail : undefined,
      code: String(body.code ?? 'unknown_error'),
      errors: Array.isArray(body.errors) ? body.errors : undefined,
    }
  }
  // fetch rejects with a TypeError when the request never completes.
  return { status: 0, title: 'Network error', code: 'network_error' }
}
```

### Auth errors

| Case | Status | `code` | `detail` |
| --- | --- | --- | --- |
| Wrong password, or an unknown email | `401` | `invalid_email_or_password` | Invalid email or password |
| Email already registered | `422` | `user_already_exists_use_another_email` | User already exists. Use another email. |
| Password shorter than 8 | `400` | `password_too_short` | Password too short |
| `name` or another field missing | `400` | `validation_failed` | [body.name] Invalid input: expected string, received undefined |
| An `Origin` the API does not trust | `403` | `invalid_origin` | Invalid origin |
| Too many attempts | `429` | `too_many_requests` | Too many requests. Please try again later. |

### Show the error next to the right input

Errors from the data routes list each problem in `errors`, with a JSON pointer in `field` (for example
`/name`) and `in` saying which part of the request it came from. Show an entry whose `in` is `body` next
to the input with that name. The auth errors have **no `errors` list**. Only `detail` and `code` are
kept, so:

- Pick the input from the `code`: `user_already_exists_use_another_email` belongs to the email input, and
  `password_too_short` to the password input.
- For `validation_failed` on auth, the `detail` starts with the field in brackets, such as
  `[body.name]`. Read the field from that prefix. It is plain text from Better Auth, so fall back to a
  general message when it is not there.
- Show anything you cannot place as a message above the form, with the `title` and `detail`.

### Rate limits

Sign-in and sign-up are rate limited. Against the Docker image, the fourth wrong sign-in within a few
seconds returned `429` with an `X-Retry-After: 10` header. The header is not in the API's
`Access-Control-Expose-Headers`, so JavaScript in a browser cannot read it. Show the `detail`, and tell
the user to wait a few seconds.

### Expired sessions

A session lasts 7 days. When a data request returns `401` with the code `unauthorized`, the session is
gone. Refetch the session and send the user to the sign-in page.

## Troubleshooting

- **The client reports a network error, but the API is running.** A browser gives the same failure for a
  request that CORS blocked as for one that never arrived, and the real reason is only in the browser's
  console. Check that your app's origin is in `CORS_ORIGINS`, and that the API was restarted or recreated
  after you changed it. A quick check from a terminal:

  ```sh
  curl -i -X OPTIONS http://localhost:3000/api/auth/sign-in/email \
    -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST'
  ```

  The response has an `Access-Control-Allow-Origin` header for a trusted origin, and none otherwise.
- **`403` `invalid_origin`.** The request reached the API from an origin it does not trust. Add the origin
  to `CORS_ORIGINS`. See also the matching entry in the
  [Insomnia guide](./INSOMNIA.md#troubleshooting).
- **Sign-in works, and the next request is a `401`.** The cookie was not sent. Check `credentials:
  'include'` on both the client and your `fetch` calls, and that the page and the API addresses use the
  same host name (`localhost` for both, rather than one of them being `api.chinook.localhost`).
- **A signed-in user sees `403` `This action requires the admin role.` on a write.** The account is an
  ordinary user. Sign in with an admin account.
