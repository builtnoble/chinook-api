import type { FieldError } from './problem';
import { problem } from './problem';

// What a validation failure says, shared with the OpenAPI examples.
export const VALIDATION_CODE = 'validation_failed';
export const VALIDATION_DETAIL = 'The request is not valid.';

// The part of a Standard Schema issue this library reads. `code` and `keys` are
// not in the standard; validators such as Zod add them, and they are used when
// present.
type Issue = {
    message: string;
    path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
    code?: string;
    keys?: readonly string[];
};

type Result = { success: true } | { success: false; error: readonly Issue[]; target?: string };

export type ValidationHookOptions = {
    /** The status of a validation failure. Defaults to 400. */
    status?: 400 | 422;
    detail?: string;
};

// Where in the request each target of a Hono validator is.
const LOCATIONS: Record<string, FieldError['in']> = {
    json: 'body',
    form: 'body',
    param: 'path',
    query: 'query',
    header: 'header',
    cookie: 'cookie',
};

const escapePointer = (segment: string) => segment.replace(/~/g, '~0').replace(/\//g, '~1');

// A JSON Pointer (RFC 6901) to a value. The empty path is the whole value,
// which is the empty pointer.
const pointer = (segments: readonly PropertyKey[]) =>
    segments.map((segment) => `/${escapePointer(String(segment))}`).join('');

const fieldErrors = (issues: readonly Issue[], location: FieldError['in']): FieldError[] =>
    issues.flatMap((issue) => {
        const path = (issue.path ?? []).map((segment) =>
            typeof segment === 'object' && segment !== null ? segment.key : segment,
        );
        const base = { ...(location ? { in: location } : {}), message: issue.message };
        const code = issue.code ? { code: issue.code } : {};

        // An unknown key has no path of its own, so each one is reported where
        // it is.
        if (issue.keys?.length) {
            return issue.keys.map((key) => ({ field: pointer([...path, key]), ...base, ...code }));
        }

        return [{ field: pointer(path), ...base, ...code }];
    });

/**
 * A validator hook that fails a request with a problem document listing every
 * issue. It works with any validator that calls a hook with Standard Schema
 * issues, such as `@hono/standard-validator` and `hono-openapi`.
 *
 * ```ts
 * validator('json', schema, validationHook());
 * ```
 */
export const validationHook =
    ({ status = 400, detail = VALIDATION_DETAIL }: ValidationHookOptions = {}) =>
    (result: Result) => {
        if (!result.success) {
            throw problem(status, detail, {
                code: VALIDATION_CODE,
                errors: fieldErrors(result.error, LOCATIONS[result.target ?? '']),
            });
        }
    };
