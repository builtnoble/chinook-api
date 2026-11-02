import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** The media type of a problem document, from RFC 9457. */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * One thing wrong with the request, as listed in the `errors` member of a
 * validation problem.
 */
export type FieldError = {
    /**
     * A JSON Pointer (RFC 6901) to the offending value, relative to the part of
     * the request named by `in`.
     */
    field: string;
    /** Which part of the request `field` points into. */
    in?: 'body' | 'path' | 'query' | 'header' | 'cookie';
    message: string;
    /** The validator's own code for the issue, such as `invalid_type`. */
    code?: string;
};

/**
 * A problem document: the members RFC 9457 defines, plus the extensions this
 * library adds.
 */
export type ProblemDetails = {
    type: string;
    title: string;
    status: number;
    detail?: string;
    instance?: string;
    /** A stable, machine-readable name for the problem, such as `not_found`. */
    code?: string;
    errors?: FieldError[];
    [extension: string]: unknown;
};

export type ProblemOptions = {
    /** Defaults to the snake_case of the title, for example `not_found`. */
    code?: string;
    /** Defaults to the reason phrase of the status. */
    title?: string;
    /**
     * A URI reference naming the kind of problem. Defaults to `about:blank`.
     */
    type?: string;
    /** A URI reference for this occurrence of the problem. */
    instance?: string;
    errors?: FieldError[];
    /**
     * Further members to add to the document. The members RFC 9457 defines
     * cannot be overridden.
     */
    extensions?: Record<string, unknown>;
    /**
     * Headers to send with the response, such as `WWW-Authenticate` on a 401.
     */
    headers?: HeadersInit;
    /**
     * What went wrong underneath. It is kept for logging and is never part of
     * the response.
     */
    cause?: unknown;
};

// The reason phrases of RFC 9110 section 15, for the statuses an error is
// likely to use.
const TITLES: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    406: 'Not Acceptable',
    408: 'Request Timeout',
    409: 'Conflict',
    410: 'Gone',
    411: 'Length Required',
    412: 'Precondition Failed',
    413: 'Content Too Large',
    414: 'URI Too Long',
    415: 'Unsupported Media Type',
    416: 'Range Not Satisfiable',
    417: 'Expectation Failed',
    421: 'Misdirected Request',
    422: 'Unprocessable Content',
    423: 'Locked',
    424: 'Failed Dependency',
    425: 'Too Early',
    426: 'Upgrade Required',
    428: 'Precondition Required',
    429: 'Too Many Requests',
    431: 'Request Header Fields Too Large',
    451: 'Unavailable For Legal Reasons',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
    505: 'HTTP Version Not Supported',
};

/**
 * The title for a status: its reason phrase, or a generic one for a status
 * without a phrase here.
 */
export const statusTitle = (status: number): string =>
    TITLES[status] ?? (status >= 500 ? 'Server Error' : 'Client Error');

const snakeCase = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');

/**
 * An error that becomes a problem document. It is an `HTTPException`, so
 * anything that already catches those handles it, and `getResponse()` returns
 * the problem response even where the handler from this library is not
 * installed.
 *
 * ```ts
 * throw problem(404, 'Artist not found.');
 * ```
 */
export class ProblemError extends HTTPException {
    readonly options: Readonly<ProblemOptions>;

    constructor(status: ContentfulStatusCode, detail?: string, options: ProblemOptions = {}) {
        if (status < 400 || status > 599) {
            throw new RangeError(`A problem needs an error status, 400 to 599, not ${status}.`);
        }

        super(status, { message: detail, cause: options.cause });
        this.name = 'ProblemError';
        this.options = options;
    }

    /** The problem document this error stands for. */
    toProblemDetails(): ProblemDetails {
        const { options } = this;
        const title = options.title ?? statusTitle(this.status);

        const members: ProblemDetails = {
            type: options.type ?? 'about:blank',
            title,
            status: this.status,
            ...(this.message ? { detail: this.message } : {}),
            ...(options.instance ? { instance: options.instance } : {}),
            code: options.code ?? snakeCase(title),
            ...(options.errors ? { errors: options.errors } : {}),
        };

        // An extension never replaces a member above, whatever its name.
        const extensions = Object.entries(options.extensions ?? {}).filter(([name]) => !(name in members));

        return { ...members, ...Object.fromEntries(extensions) };
    }

    override getResponse(): Response {
        const headers = new Headers(this.options.headers);
        headers.set('Content-Type', PROBLEM_CONTENT_TYPE);

        return new Response(JSON.stringify(this.toProblemDetails()), { status: this.status, headers });
    }
}

/** Creates a `ProblemError`. Throw it, or return its `getResponse()`. */
export const problem = (status: ContentfulStatusCode, detail?: string, options?: ProblemOptions): ProblemError =>
    new ProblemError(status, detail, options);
