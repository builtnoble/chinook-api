import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { type DescribeRouteOptions, describeRoute, resolver, validator } from 'hono-openapi';
import z from 'zod';
import db from '@/db';
import { albums } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { albumSchema, paginationSchema, paramSchema, querySchema } from '@/utils/schema';

const albumRoutes = new Hono();

const paginatedResponseSchema = z.object({
    data: z.array(albumSchema),
    pagination: paginationSchema,
});

const getAlbums: DescribeRouteOptions = {
    operationId: 'getAlbums',
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

albumRoutes.get(
    '/',
    describeRoute(getAlbums),
    validator('query', querySchema),
    paginationMiddleware(albums),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const albums = await db.query.albums.findMany({
            with: {
                artist: true,
            },
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: albums,
            pagination,
        });
    },
);

const getAlbumByID: DescribeRouteOptions = {
    operationId: 'getAlbumByID',
    responses: {
        200: {
            description: 'Successful response',
            content: {
                'application/json': {
                    schema: resolver(albumSchema),
                },
            },
        },
    },
};

albumRoutes.get('/:id', describeRoute(getAlbumByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.albums.findFirst({
        where: eq(albums.id, id),
        with: {
            artist: true,
        },
    });

    return c.json({ data });
});

export default albumRoutes;
