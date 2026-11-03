# problem-details

[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details for [Hono](https://hono.dev). Every error your API
returns becomes the same `application/problem+json` document, whether you threw it, Hono threw it, or a validator
rejected the request.

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Artist not found.",
  "code": "not_found"
}
```

It has no dependencies other than `hono`, uses only web-standard APIs (`Response`, `Headers`), and never logs.

## Use

```ts
import { Hono } from 'hono';
import { problem, problemDetailsHandler, problemNotFound } from './problem-details';

const app = new Hono();

app.onError(problemDetailsHandler({ onUnhandledError: (error) => console.error(error) }));
app.notFound(problemNotFound);

app.get('/artists/:id', async (c) => {
    const artist = await find(c.req.param('id'));

    if (!artist) {
        throw problem(404, 'Artist not found.');
    }

    return c.json({ data: artist });
});
```

## `problem(status, detail?, options?)`

Creates a `ProblemError`, which you throw. It extends Hono's `HTTPException`, so anything that already handles those
handles it. Its `getResponse()` returns the problem response, so Hono's own default handler also renders it correctly
if you have not installed `problemDetailsHandler`.

| Option       | Default                      | Meaning                                                                         |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------- |
| `code`       | snake_case of the title      | A stable, machine-readable name, such as `not_found`.                           |
| `title`      | the reason phrase of status  | The same for every occurrence of the problem.                                   |
| `type`       | `about:blank`                | A URI reference naming the kind of problem.                                     |
| `instance`   | none                         | A URI reference for this occurrence.                                            |
| `errors`     | none                         | `FieldError[]`, for a request that failed validation.                           |
| `extensions` | none                         | More members. They can never replace `type`, `title`, `status`, `detail`, `code`.|
| `headers`    | none                         | Sent with the response, for example `WWW-Authenticate` on a 401.                |
| `cause`      | none                         | What went wrong underneath. For logging only: it is never in the response.      |

The status must be an error status, 400 to 599, or it throws a `RangeError`.

`about:blank` is not the empty browser page here. In RFC 9457 it is a predefined `type` meaning "this problem has no
meaning beyond its HTTP status code". It is an identifier, not a link: clients do not fetch it, and nothing opens. Set a
real URI in `type` when a kind of problem deserves its own documentation.

## `problemDetailsHandler(options?)`

An `app.onError` handler.

- A **`ProblemError`** is answered as it describes itself.
- Any other **`HTTPException`** keeps its status and the headers of its `res` (a `WWW-Authenticate` set by a Hono
  middleware survives), and gets a problem body made from its message. Its own body and content type are replaced. A
  **5xx** `HTTPException` is answered with a generic detail and reported, because its message was not written for the
  caller.
- **Anything else** is a generic `500`: `"An unexpected error occurred."` The real message never reaches the response.

| Option             | Meaning                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `mapError`         | Turns an error you recognize, such as a database error, into a `ProblemError`. Return `undefined` to pass. It is asked about every error that is not already a `ProblemError`. |
| `onUnhandledError` | Called with the original error whenever the answer is a generic 500, so you can log it. If it throws, the error is ignored. |

```ts
app.onError(
    problemDetailsHandler({
        mapError: (error) => (isUniqueViolation(error) ? problem(409, 'That value already exists.') : undefined),
        onUnhandledError: (error) => logger.error(error),
    }),
);
```

Hono calls `onError` only for thrown `Error` instances. Throw a `ProblemError`, an `Error` or an `HTTPException`, never
a string.

## `problemNotFound`

Answers a request that matches no route with a 404 problem. Register it on the **top-level** app with
`app.notFound(problemNotFound)`: Hono ignores the `notFound` handler of a sub-app that has been mounted.

## `validationHook(options?)`

A validator hook that fails an invalid request with a problem listing every issue. It works with any validator that
calls a hook with [Standard Schema](https://standardschema.dev) issues, such as `@hono/standard-validator` and
`hono-openapi`.

```ts
import { validator } from 'hono-openapi'; // or sValidator from '@hono/standard-validator'

app.post('/artists', validator('json', schema, validationHook()), handler);
```

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "The request is not valid.",
  "code": "validation_failed",
  "errors": [
    { "field": "/name", "in": "body", "message": "Invalid input: expected string, received undefined", "code": "invalid_type" },
    { "field": "/colour", "in": "body", "message": "Unrecognized key: \"colour\"", "code": "unrecognized_keys" }
  ]
}
```

- `field` is a [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) (`/track/id`, `/tags/1`) relative to the part of
  the request named by `in`: `body`, `path`, `query`, `header` or `cookie`. An issue about the whole value has the
  empty pointer.
- Zod's `unrecognized_keys` issues are reported once per key, at the key's own pointer, not at an empty field.
- `status` defaults to `400`. Pass `{ status: 422 }` if you prefer it. `detail` can be changed too.

## Better Auth

`problem-details/betterAuthProblem` rewrites a failed [Better Auth](https://www.better-auth.com) response as a problem
document, so its errors look like every other error. It is a separate entry point, and it imports nothing from Better
Auth: it only reads the JSON that Better Auth sends, `{ "message", "code" }`.

```ts
import { problemFromAuthResponse } from './problem-details/betterAuthProblem';

app.on(['GET', 'POST'], '/api/auth/*', async (c) => problemFromAuthResponse(await auth.handler(c.req.raw)));
```

- A response below 400 is returned as it is.
- `message` becomes the `detail`. The `code` is lower-cased (`INVALID_EMAIL_OR_PASSWORD` becomes
  `invalid_email_or_password`), and `VALIDATION_ERROR` becomes `validation_failed`, as `validationHook` names it.
- Nothing else is copied. Better Auth attaches the raw error, such as the failing SQL with its values, as `details` to
  some failures, and that cannot reach the client.
- The other headers are kept, including every `Set-Cookie`. A response with no JSON body, such as an unknown path,
  gets the status alone.
- A server error is thrown as an `HTTPException` that carries the response, so `problemDetailsHandler` has to be
  registered. It answers with its generic detail and reports the error through `onUnhandledError`.

## Describing the responses (OpenAPI)

`problem-details/zod` exports Zod schemas for the documents, for use with a library that builds OpenAPI from Zod. It
is a separate entry point so the rest of the library does not need Zod.

```ts
import { problemDetailsSchema, validationProblemSchema } from './problem-details/zod';
```

`toProblemDetails()` on a `ProblemError` returns the document, which makes it a ready-made example:
`problem(404, 'Artist not found.').toProblemDetails()`.

## Design notes

- **No logging, no globals.** The library reports through `onUnhandledError` and nothing else.
- **No leaking.** A response is built from the status, the message of a `ProblemError`, and the fields you put in it. A
  `cause` or any other error's message is not part of it.
- **JSON only.** There is no `Accept` negotiation and no XML.
