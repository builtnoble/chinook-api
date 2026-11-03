# problem-details

[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details for [Hono](https://hono.dev). Every error your
API returns becomes the same `application/problem+json` document, whether you threw it, Hono threw it, or a
validator rejected the request.

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Artist not found.",
  "code": "not_found"
}
```

It depends only on `hono`, uses only web-standard APIs (`Response`, `Headers`), and never logs.

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

Creates a `ProblemError`, which you throw. It extends Hono's `HTTPException`, so anything that already handles
those handles it. Its `getResponse()` returns the problem response, so Hono's default handler also renders it
correctly if you have not installed `problemDetailsHandler`.

| Option       | Default                      | Meaning                                                                         |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------- |
| `code`       | snake_case of the title      | A stable, machine-readable name, such as `not_found`.                           |
| `title`      | the reason phrase of status  | The same for every occurrence of the problem.                                   |
| `type`       | `about:blank`                | A URI reference naming the kind of problem.                                     |
| `instance`   | none                         | A URI reference for this occurrence.                                            |
| `errors`     | none                         | `FieldError[]`, for a request that failed validation.                           |
| `extensions` | none                         | More members. They can never replace `type`, `title`, `status`, `detail` or `code`. |
| `headers`    | none                         | Sent with the response, for example `WWW-Authenticate` on a 401.                |
| `cause`      | none                         | What went wrong underneath. For logging only; it is never in the response.      |

The status must be an error status, 400 to 599, or it throws a `RangeError`.

`about:blank` is not the empty browser page here. In RFC 9457 it means "this problem has no meaning beyond its
HTTP status code". It is a name and not a link, so clients do not fetch it. Set a real URI in `type` when a kind
of problem deserves its own documentation.

## `problemDetailsHandler(options?)`

An `app.onError` handler.

- A **`ProblemError`** is answered as it describes itself.
- Any other **`HTTPException`** keeps its status and the headers of its `res` (a `WWW-Authenticate` set by a Hono
  middleware survives), and gets a problem body made from its message. Its own body and content type are
  replaced. A **5xx** `HTTPException` is answered with a generic detail and reported, because its message was not
  written for the caller.
- **Anything else** is a generic `500`: `"An unexpected error occurred."` The real message never reaches the
  response.

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

Hono only calls `onError` for thrown `Error` instances. Throw a `ProblemError`, an `Error` or an `HTTPException`,
never a string.

## `problemNotFound`

Answers a request that matches no route with a 404 problem. Register it on the **top-level** app with
`app.notFound(problemNotFound)`, because Hono ignores the `notFound` handler of a mounted sub-app.

## `validationHook(options?)`

A validator hook that fails an invalid request with a problem listing every issue. It works with any validator
that calls a hook with [Standard Schema](https://standardschema.dev) issues, such as `@hono/standard-validator`
and `hono-openapi`.

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

- `field` is a [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) (`/track/id`, `/tags/1`) within the part of
  the request named by `in`: `body`, `path`, `query`, `header` or `cookie`. An issue about the whole value has the
  empty pointer.
- Zod's `unrecognized_keys` issues are reported once per key, at the key's own pointer.
- `status` defaults to `400`. Pass `{ status: 422 }` to use that instead. `detail` can be changed too.

## Better Auth

`problem-details/betterAuthProblem` rewrites a failed [Better Auth](https://www.better-auth.com) response as a
problem document, so its errors look like every other error. It is a separate entry point and imports nothing
from Better Auth. It only reads the JSON that Better Auth sends, `{ "message", "code" }`.

```ts
import { problemFromAuthResponse } from './problem-details/betterAuthProblem';

app.on(['GET', 'POST'], '/api/auth/*', async (c) => problemFromAuthResponse(await auth.handler(c.req.raw)));
```

- A response below 400 is returned as it is.
- `message` becomes the `detail`. The `code` is lower-cased (`INVALID_EMAIL_OR_PASSWORD` becomes
  `invalid_email_or_password`), and `VALIDATION_ERROR` becomes `validation_failed`, the name `validationHook` uses.
- Nothing else is copied. Better Auth attaches the raw error, such as the failing SQL with its values, as
  `details` to some failures, and that must not reach the client.
- The other headers are kept, including every `Set-Cookie`. A response with no JSON body, such as an unknown
  path, gets the status alone.
- A server error is thrown as an `HTTPException` that carries the response, so `problemDetailsHandler` has to be
  registered. It answers with its generic detail and reports the error through `onUnhandledError`.

## Documenting errors in OpenAPI

Two more entry points describe the error responses for OpenAPI. Both are separate so the rest of the library does
not need Zod or `hono-openapi`.

`problem-details/zod` exports Zod schemas for the documents:

```ts
import { problemDetailsSchema, validationProblemSchema } from './problem-details/zod';
```

`toProblemDetails()` on a `ProblemError` returns the document, which makes it a ready-made example:
`problem(404, 'Artist not found.').toProblemDetails()`.

`problem-details/openapi` builds the response objects for a route's `describeRoute` (it needs `hono-openapi` and
Zod):

```ts
import { describeRoute } from 'hono-openapi';
import {
    problemExample,
    problemResponse,
    validationExample,
    validationProblemResponse,
} from './problem-details/openapi';

describeRoute({
    responses: {
        400: validationProblemResponse(
            'The body is not valid.',
            validationExample('/name', 'body', 'Invalid input: expected string, received number'),
            problemExample(400, 'Malformed JSON in request body'),
        ),
        404: problemResponse('No such artist.', problemExample(404, 'Artist not found.')),
    },
});
```

- `problemExample(status, detail, options?)` is a problem as it is sent. It is built from a real `problem(...)`,
  so the example matches the response.
- `problemResponse(description, ...examples)` is a response with the `application/problem+json` content type and
  the schema from `problem-details/zod`.
- `validationExample(field, in, message, code?)` is a request with one invalid value. It uses the code and detail
  of `validationHook`, and a test compares it with what the hook sends.
- `validationProblemResponse(description, invalid, ...others)` documents a validation failure, and adds the other
  problems with that status as a second shape.
