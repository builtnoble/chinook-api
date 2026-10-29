import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { playlists } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeList } from '@/utils/openapi';
import { paramSchema, playlistSchema, querySchema } from '@/utils/schema';

const playlistRoutes = new Hono();

const getPlaylists = describeList({
    operationId: 'getPlaylists',
    tag: 'Playlists',
    summary: 'List all playlists',
    description: 'Returns a paginated list of playlists.',
    schema: playlistSchema,
    path: '/api/playlists',
});

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

const getPlaylistByID = describeByID({
    operationId: 'getPlaylistByID',
    tag: 'Playlists',
    summary: 'Retrieve a playlist',
    description: 'Returns the playlist with the given id. An unknown id returns 200 with no `data`.',
    schema: playlistSchema,
});

playlistRoutes.get('/:id', describeRoute(getPlaylistByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.playlists.findFirst({
        where: eq(playlists.id, id),
    });

    return c.json({ data });
});

export default playlistRoutes;
