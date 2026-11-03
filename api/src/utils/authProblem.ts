import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import isPlainObject from 'lodash-es/isPlainObject';
import { problem } from '@/lib/problem-details';

// Better Auth writes its codes in UPPER_SNAKE_CASE and calls a request that
// fails validation VALIDATION_ERROR. Ours are lower_snake_case, and the same
// failure is validation_failed.
const codeOf = (code: unknown): string | undefined => {
    if (typeof code !== 'string' || !code) {
        return undefined;
    }

    return code === 'VALIDATION_ERROR' ? 'validation_failed' : code.toLowerCase();
};

// Better Auth answers its own errors as { message, code }. Rewrite a failed
// response as a problem document, so every error the API sends has one shape.
// Only the message and the code are copied: Better Auth adds the raw error,
// such as the failing SQL with its values, as `details` to some failures, and
// that must not reach the client. A response that is not a failure, or not
// JSON, keeps its status and gets no detail.
//
// A server error is thrown as an HTTPException instead, so the error handler
// answers it as it answers every other 500 and logs what failed.
export const problemFromAuthResponse = async (res: Response): Promise<Response> => {
    if (res.status < 400) {
        return res;
    }

    const body: unknown = await res
        .clone()
        .json()
        .catch(() => undefined);
    const { message, code } = isPlainObject(body) ? (body as Record<string, unknown>) : {};
    const detail = typeof message === 'string' ? message : undefined;
    const status = res.status as ContentfulStatusCode;

    if (res.status >= 500) {
        throw new HTTPException(status, { res, message: detail, cause: body });
    }

    const headers = new Headers(res.headers);
    headers.delete('Content-Type');
    headers.delete('Content-Length');

    return problem(status, detail, { code: codeOf(code), headers }).getResponse();
};
