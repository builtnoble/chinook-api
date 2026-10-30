import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ProblemError, problem } from './problem';

export type ProblemDetailsOptions = {
    /**
     * Turns an error this library does not know into a problem, for example a database error into a 409. Return
     * `undefined` to leave it to the default handling. It is asked about every error that is not already a
     * `ProblemError`, including `HTTPException`s.
     */
    mapError?: (error: unknown, c: Context) => ProblemError | undefined;
    /**
     * Called with the original error when the response is a generic 500 or an `HTTPException` with a 5xx status, so
     * the cause can be logged. The library never logs. An error thrown here is ignored.
     */
    onUnhandledError?: (error: unknown, c: Context) => void;
};

// What a caller sees when something failed that they cannot fix. The real reason goes to `onUnhandledError`.
const UNEXPECTED = 'An unexpected error occurred.';

// A response's own headers matter (for example WWW-Authenticate), but its body and its description of that body do not.
const headersOf = (response?: Response): Headers => {
    const headers = new Headers(response?.headers);

    headers.delete('Content-Type');
    headers.delete('Content-Length');

    return headers;
};

const notify = (options: ProblemDetailsOptions, error: unknown, c: Context) => {
    try {
        options.onUnhandledError?.(error, c);
    } catch {
        // A failing logger must not turn one error into another.
    }
};

/**
 * An error handler that answers every error with a problem document (RFC 9457).
 *
 * ```ts
 * app.onError(problemDetailsHandler({ onUnhandledError: (error) => console.error(error) }));
 * ```
 *
 * - A `ProblemError` is answered as it describes itself.
 * - Any other `HTTPException` keeps its status and its headers, and gets a problem body made from its message. A 5xx
 *   is answered generically, since its message was not written for the caller.
 * - Anything else is a generic 500. Its message never reaches the response.
 */
export const problemDetailsHandler =
    (options: ProblemDetailsOptions = {}): ErrorHandler =>
    (error, c) => {
        if (error instanceof ProblemError) {
            return error.getResponse();
        }

        const mapped = options.mapError?.(error, c);

        if (mapped) {
            return mapped.getResponse();
        }

        if (error instanceof HTTPException) {
            const hidden = error.status >= 500;

            if (hidden) {
                notify(options, error, c);
            }

            return problem(error.status, hidden ? UNEXPECTED : error.message || undefined, {
                headers: headersOf(error.res),
                cause: error,
            }).getResponse();
        }

        notify(options, error, c);

        return problem(500, UNEXPECTED, { cause: error }).getResponse();
    };

/**
 * A handler for a request that matches no route. Register it on the top-level app: Hono ignores the one on a mounted
 * sub-app.
 *
 * ```ts
 * app.notFound(problemNotFound);
 * ```
 */
export const problemNotFound: NotFoundHandler = (c) =>
    problem(404, `No route matches ${c.req.method} ${c.req.path}.`).getResponse();
