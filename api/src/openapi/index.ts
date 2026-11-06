import { type DescribeRouteOptions, resolver } from 'hono-openapi';
import z, { type ZodType } from 'zod';
import { problemExample, validationExample, validationProblemResponse } from '@/lib/problem-details/openapi';
import { paginationSchema } from '@/utils/schema/requestSchema';
import {
    conflict,
    duplicate,
    forbidden,
    invalidBody,
    invalidId,
    notFound,
    unauthorized,
    unprocessable,
} from './problemResponses';

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

// A list under another item, such as the tracks in a playlist, sets `parent` to
// also document the 404 for an unknown parent id.
export const describeList = ({
    operationId,
    tag,
    summary,
    description,
    schema,
    path,
    parent = false,
}: RouteDescription & { path: string; parent?: boolean }): DescribeRouteOptions => ({
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
        ...(parent ? { 404: notFound(tag) } : {}),
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
