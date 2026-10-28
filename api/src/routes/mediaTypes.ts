import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { type DescribeRouteOptions, describeRoute, resolver, validator } from 'hono-openapi';
import z from 'zod';
import db from '@/db';
import { media_types } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { mediaTypeSchema, paginationSchema, paramSchema, querySchema } from '@/utils/schema';

const mediaTypeRoutes = new Hono();

const paginatedResponseSchema = z.object({
    data: z.array(mediaTypeSchema),
    pagination: paginationSchema,
});

const getMediaTypes: DescribeRouteOptions = {
    operationId: 'getMediaTypes',
    responses: {
        200: {
            description: 'Successful response',
            content: {
                'application/json': {
                    schema: resolver(paginatedResponseSchema),
                },
            },
        },
    },
};

mediaTypeRoutes.get(
    '/',
    describeRoute(getMediaTypes),
    validator('query', querySchema),
    paginationMiddleware(media_types),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const mediaTypes = await db.query.media_types.findMany({
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: mediaTypes,
            pagination,
        });
    },
);

const getMediaTypeByID: DescribeRouteOptions = {
    operationId: 'getMediaTypeByID',
    responses: {
        200: {
            description: 'Successful response',
            content: {
                'application/json': {
                    schema: resolver(mediaTypeSchema),
                },
            },
        },
    },
};

mediaTypeRoutes.get('/:id', describeRoute(getMediaTypeByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.media_types.findFirst({
        where: eq(media_types.id, id),
    });

    return c.json({ data });
});

export default mediaTypeRoutes;
