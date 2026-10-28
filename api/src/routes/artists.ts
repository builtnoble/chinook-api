import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { type DescribeRouteOptions, describeRoute, resolver, validator } from 'hono-openapi';
import z from 'zod';
import db from '@/db';
import { artists } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { artistSchema, paginationSchema, paramSchema, querySchema } from '@/utils/schema';

const artistRoutes = new Hono();

const paginatedResponseSchema = z.object({
    data: z.array(artistSchema),
    pagination: paginationSchema,
});

const getArtists: DescribeRouteOptions = {
    operationId: 'getArtists',
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

artistRoutes.get(
    '/',
    describeRoute(getArtists),
    validator('query', querySchema),
    paginationMiddleware(artists),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const artists = await db.query.artists.findMany({
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: artists,
            pagination,
        });
    },
);

const getArtistByID: DescribeRouteOptions = {
    operationId: 'getArtistByID',
    responses: {
        200: {
            description: 'Successful response',
            content: {
                'application/json': {
                    schema: resolver(artistSchema),
                },
            },
        },
    },
};

artistRoutes.get('/:id', describeRoute(getArtistByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.artists.findFirst({
        where: eq(artists.id, id),
    });

    return c.json({ data });
});

export default artistRoutes;
