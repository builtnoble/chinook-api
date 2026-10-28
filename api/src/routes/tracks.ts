import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { type DescribeRouteOptions, describeRoute, resolver, validator } from 'hono-openapi';
import z from 'zod';
import db from '@/db';
import { tracks } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { paginationSchema, paramSchema, querySchema, trackSchema } from '@/utils/schema';

const trackRoutes = new Hono();

const paginatedResponseSchema = z.object({
    data: z.array(trackSchema),
    pagination: paginationSchema,
});

const getTracks: DescribeRouteOptions = {
    operationId: 'getTracks',
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

trackRoutes.get(
    '/',
    describeRoute(getTracks),
    validator('query', querySchema),
    paginationMiddleware(tracks),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const tracks = await db.query.tracks.findMany({
            orderBy: (albums, { asc }) => asc(albums.id),
            with: {
                album: {
                    with: {
                        artist: true,
                    },
                },
                genre: true,
                media_type: true,
            },
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: tracks,
            pagination,
        });
    },
);

const getTrackByID: DescribeRouteOptions = {
    operationId: 'getTrackByID',
    responses: {
        200: {
            description: 'Successful response',
            content: {
                'application/json': {
                    schema: resolver(trackSchema),
                },
            },
        },
    },
};

trackRoutes.get('/:id', describeRoute(getTrackByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.tracks.findFirst({
        where: eq(tracks.id, id),
        with: {
            album: {
                with: {
                    artist: true,
                },
            },
            genre: true,
            media_type: true,
        },
    });

    return c.json(data);
});

export default trackRoutes;
