import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { type DescribeRouteOptions, describeRoute, resolver, validator } from 'hono-openapi';
import z from 'zod';
import db from '@/db';
import { playlists } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { paginationSchema, paramSchema, playlistSchema, querySchema } from '@/utils/schema';

const playlistRoutes = new Hono();

const paginatedResponseSchema = z.object({
    data: z.array(playlistSchema),
    pagination: paginationSchema,
});

const getPlaylists: DescribeRouteOptions = {
    operationId: 'getPlaylists',
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

playlistRoutes.get(
    '/',
    describeRoute(getPlaylists),
    validator('query', querySchema),
    paginationMiddleware(playlists),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const playlists = await db.query.playlists.findMany({
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: playlists,
            pagination,
        });
    },
);

const getPlaylistByID: DescribeRouteOptions = {
    operationId: 'getPlaylistByID',
    responses: {
        200: {
            description: 'Successful response',
            content: {
                'application/json': {
                    schema: resolver(playlistSchema),
                },
            },
        },
    },
};

playlistRoutes.get('/:id', describeRoute(getPlaylistByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.playlists.findFirst({
        where: eq(playlists.id, id),
    });

    return c.json({ data });
});

export default playlistRoutes;
