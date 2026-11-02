import { type DescribeRouteOptions, resolver } from 'hono-openapi';
import z, { type ZodType } from 'zod';
import {
    conflictSchema,
    forbiddenSchema,
    malformedJsonSchema,
    notFoundSchema,
    paginationErrorSchema,
    paginationSchema,
    unauthorizedSchema,
    unprocessableSchema,
    validationErrorSchema,
} from '@/utils/schema/responseSchema';

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

const unauthorized = jsonResponse('Missing or invalid credentials.', unauthorizedSchema);

const forbidden = jsonResponse(
    'The caller is signed in but is not an admin, or the request is a cookie write from an origin that is not allowed.',
    forbiddenSchema,
);

// "Media Types" -> "Media type not found.", the message the routes return, so each page shows its own resource.
const notFoundMessage = (tag: string) => {
    const name = tag.replace(/s$/, '').toLowerCase();

    return `${name.charAt(0).toUpperCase()}${name.slice(1)} not found.`;
};

const notFound = (tag: string, message = notFoundMessage(tag)) =>
    jsonResponse(
        'No item has the requested id, or it has been deleted.',
        notFoundSchema.meta({ examples: [{ error: message }] }),
    );

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
        400: jsonResponse(
            'The query is invalid, or the requested page or limit is out of range.',
            z.union([validationErrorSchema, paginationErrorSchema]),
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
        400: jsonResponse('The id is not a number.', validationErrorSchema),
        401: unauthorized,
        404: notFound(tag),
    },
});

type WriteDescription = RouteDescription & {
    // The request body: the table's insert schema for a create, its partial for an update.
    body: ZodType;
};

// `resolver` returns the lazy schema hono-openapi expands when it builds the document, which its types do not allow here.
const requestBody = (body: ZodType) =>
    ({
        required: true,
        content: { 'application/json': { schema: resolver(body) } },
    }) as DescribeRouteOptions['requestBody'];

// The shared validation error shows a bad path parameter, so a body error gets its own example.
const invalidBodySchema = validationErrorSchema.meta({
    examples: [
        {
            success: false,
            data: { name: 42 },
            error: [
                { code: 'invalid_type', message: 'Invalid input: expected string, received number', path: ['name'] },
            ],
        },
    ],
});

const invalidBody = jsonResponse(
    'The body is not valid JSON, or a field is missing, unknown or of the wrong type.',
    z.union([invalidBodySchema, malformedJsonSchema]),
);

const unprocessable = jsonResponse(
    'A field refers to a parent that does not exist or is deleted, or a value is too long.',
    unprocessableSchema,
);

const conflict = (description: string) => jsonResponse(description, conflictSchema);

// Writes need the admin role, so every one documents the 403 beside the 401. A create under another item, such as a
// track in a playlist, sets `parent` to also document the 404 for an unknown parent id.
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
        409: conflict('A unique value collides with an existing row.'),
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
        409: conflict('A unique value collides with an existing row.'),
        422: unprocessable,
    },
});

// `blockedBy` says what makes the delete a 409. Leave it out for an item that nothing depends on.
export const describeDelete = ({
    operationId,
    tag,
    summary,
    description,
    schema,
    blockedBy,
    notFoundError,
}: RouteDescription & {
    blockedBy?: string;
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
        400: jsonResponse('The id is not a number, or a query parameter is invalid.', validationErrorSchema),
        401: unauthorized,
        403: forbidden,
        404: notFound(tag, notFoundError),
        ...(blockedBy ? { 409: conflict(blockedBy) } : {}),
    },
});
