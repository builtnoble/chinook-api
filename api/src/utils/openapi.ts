import { type DescribeRouteOptions, resolver } from 'hono-openapi';
import z, { type ZodType } from 'zod';
import type { ProblemDetails } from '@/lib/problem-details';
import {
    problemExample,
    problemResponse,
    validationExample,
    validationProblemResponse,
} from '@/lib/problem-details/openapi';
import { paginationSchema } from '@/utils/schema/requestSchema';

type RouteDescription = {
    operationId: string;
    tag: string;
    summary: string;
    description: string;
    schema: ZodType;
};

const jsonResponse = (description: string, schema: ZodType) => ({
    description,
    content: {
        'application/json': {
            schema: resolver(schema),
        },
    },
});

// The sample row attached to a model schema with `.meta({ examples })`.
const sampleOf = (schema: ZodType) => (schema.meta()?.examples as unknown[] | undefined)?.[0];

const invalidId = validationExample('/id', 'path', 'Invalid input: expected number, received NaN');

const unauthorized = {
    ...problemResponse('Missing or invalid credentials.', problemExample(401, 'Missing or invalid credentials.')),
    headers: {
        'WWW-Authenticate': {
            description:
                'The scheme to authenticate with: `Bearer`, with `error="invalid_token"` when a bearer token was sent and failed.',
            schema: { type: 'string' as const },
        },
    },
};

const forbidden = problemResponse(
    'The caller is signed in but is not an admin, or the request is a cookie write from an origin that is not allowed.',
    problemExample(403, 'This action requires the admin role.'),
    problemExample(403, 'The request comes from an origin that is not allowed.', { code: 'origin_not_allowed' }),
);

// "Media Types" -> "Media type not found.", the message the routes return, so
// each page shows its own resource.
const notFoundMessage = (tag: string) => {
    const name = tag.replace(/s$/, '').toLowerCase();

    return `${name.charAt(0).toUpperCase()}${name.slice(1)} not found.`;
};

const notFound = (tag: string, message = notFoundMessage(tag)) =>
    problemResponse('No item has the requested id, or it has been deleted.', problemExample(404, message));

export const describeList = ({
    operationId,
    tag,
    summary,
    description,
    schema,
    path,
}: RouteDescription & { path: string }): DescribeRouteOptions => ({
    operationId,
    tags: [tag],
    summary,
    description,
    security: [{ bearerAuth: [] }],
    responses: {
        200: jsonResponse(
            'A page of results.',
            z.object({ data: z.array(schema), pagination: paginationSchema }).meta({
                examples: [
                    {
                        data: [sampleOf(schema)],
                        pagination: {
                            current_page: 1,
                            per_page: 1,
                            total_items: 3,
                            total_pages: 3,
                            prev_page_url: null,
                            next_page_url: `${path}?page=2`,
                        },
                    },
                ],
            }),
        ),
        400: validationProblemResponse(
            'The query is invalid, or the requested page or limit is out of range.',
            validationExample('/page', 'query', 'Invalid input: expected number, received NaN'),
            problemExample(400, 'Page cannot exceed 35.', { code: 'page_out_of_range' }),
            problemExample(400, 'Limit cannot exceed 347.', { code: 'limit_out_of_range' }),
        ),
        401: unauthorized,
    },
});

export const describeByID = ({
    operationId,
    tag,
    summary,
    description,
    schema,
}: RouteDescription): DescribeRouteOptions => ({
    operationId,
    tags: [tag],
    summary,
    description,
    security: [{ bearerAuth: [] }],
    responses: {
        200: jsonResponse(
            'The requested item.',
            z.object({ data: schema }).meta({ examples: [{ data: sampleOf(schema) }] }),
        ),
        400: validationProblemResponse('The id is not a number.', invalidId),
        401: unauthorized,
        404: notFound(tag),
    },
});

type WriteDescription = RouteDescription & {
    // The request body: the table's insert schema for a create, its partial for
    // an update.
    body: ZodType;
};

// `resolver` returns the lazy schema hono-openapi expands when it builds the
// document, which its types do not allow here.
const requestBody = (body: ZodType) =>
    ({
        required: true,
        content: { 'application/json': { schema: resolver(body) } },
    }) as DescribeRouteOptions['requestBody'];

const invalidBody = validationProblemResponse(
    'The body is not valid JSON, or a field is missing, unknown or of the wrong type.',
    validationExample('/name', 'body', 'Invalid input: expected string, received number'),
    problemExample(400, 'Malformed JSON in request body'),
);

const unprocessable = problemResponse(
    'A field refers to a parent that does not exist or is deleted, or a value is too long.',
    problemExample(422, 'The row refers to a parent that does not exist.', { code: 'invalid_reference' }),
    problemExample(422, 'A value is too long for its column.', { code: 'value_too_long' }),
);

const conflict = (description: string, ...examples: ProblemDetails[]) => problemResponse(description, ...examples);

const duplicate = conflict(
    'A unique value collides with an existing row.',
    problemExample(409, 'A row with that value already exists.', { code: 'duplicate_value' }),
);

// Writes need the admin role, so every one documents the 403 beside the 401. A
// create under another item, such as a track in a playlist, sets `parent` to
// also document the 404 for an unknown parent id.
export const describeCreate = ({
    operationId,
    tag,
    summary,
    description,
    schema,
    body,
    parent = false,
}: WriteDescription & { parent?: boolean }): DescribeRouteOptions => ({
    operationId,
    tags: [tag],
    summary,
    description,
    security: [{ bearerAuth: [] }],
    requestBody: requestBody(body),
    responses: {
        201: jsonResponse(
            'The created item.',
            z.object({ data: schema }).meta({ examples: [{ data: sampleOf(schema) }] }),
        ),
        400: invalidBody,
        401: unauthorized,
        403: forbidden,
        ...(parent ? { 404: notFound(tag) } : {}),
        409: duplicate,
        422: unprocessable,
    },
});

export const describeUpdate = ({
    operationId,
    tag,
    summary,
    description,
    schema,
    body,
}: WriteDescription): DescribeRouteOptions => ({
    operationId,
    tags: [tag],
    summary,
    description,
    security: [{ bearerAuth: [] }],
    requestBody: requestBody(body),
    responses: {
        200: jsonResponse(
            'The updated item.',
            z.object({ data: schema }).meta({ examples: [{ data: sampleOf(schema) }] }),
        ),
        400: invalidBody,
        401: unauthorized,
        403: forbidden,
        404: notFound(tag),
        409: duplicate,
        422: unprocessable,
    },
});

// `blockedBy` says what makes the delete a 409. Leave it out for an item that
// nothing depends on.
export const describeDelete = ({
    operationId,
    tag,
    summary,
    description,
    schema,
    blockedBy,
    blockedExample,
    notFoundError,
}: RouteDescription & {
    blockedBy?: string;
    // The 409 message, such as "The genre is used by 3 tracks. Reassign them
    // first.".
    blockedExample?: string;
    // The 404 message, when it is not "<Resource> not found.".
    notFoundError?: string;
}): DescribeRouteOptions => ({
    operationId,
    tags: [tag],
    summary,
    description,
    security: [{ bearerAuth: [] }],
    responses: {
        200: jsonResponse(
            'The deleted item.',
            z.object({ data: schema }).meta({ examples: [{ data: sampleOf(schema) }] }),
        ),
        400: validationProblemResponse('The id is not a number, or a query parameter is invalid.', invalidId),
        401: unauthorized,
        403: forbidden,
        404: notFound(tag, notFoundError),
        ...(blockedBy
            ? {
                  409: conflict(
                      blockedBy,
                      problemExample(409, blockedExample ?? 'The item is still in use.', { code: 'delete_blocked' }),
                  ),
              }
            : {}),
    },
});
