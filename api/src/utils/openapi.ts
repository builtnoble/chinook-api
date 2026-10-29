import { type DescribeRouteOptions, resolver } from 'hono-openapi';
import z, { type ZodType } from 'zod';
import { paginationErrorSchema, paginationSchema, unauthorizedSchema, validationErrorSchema } from '@/utils/schema';

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

const unauthorized = jsonResponse('Missing or invalid credentials.', unauthorizedSchema);

export const describeList = ({
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
        200: jsonResponse('A page of results.', z.object({ data: z.array(schema), pagination: paginationSchema })),
        400: jsonResponse(
            'The query is invalid, or the requested page or limit is out of range.',
            z.union([validationErrorSchema, paginationErrorSchema]),
        ),
        401: unauthorized,
    },
});

// `data` is absent when no item has the requested id.
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
        200: jsonResponse('The requested item.', z.object({ data: schema.optional() })),
        400: jsonResponse('The id is not a number.', validationErrorSchema),
        401: unauthorized,
    },
});
