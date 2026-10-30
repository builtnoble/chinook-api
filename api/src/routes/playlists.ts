import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { playlists } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeCreate, describeDelete, describeList, describeUpdate } from '@/utils/openapi';
import { paramSchema, playlistCreateSchema, playlistSchema, playlistUpdateSchema, querySchema } from '@/utils/schema';

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
    description: 'Returns the playlist with the given id. An unknown id returns 404.',
    schema: playlistSchema,
});

playlistRoutes.get('/:id', describeRoute(getPlaylistByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.playlists.findFirst({
        where: eq(playlists.id, id),
    });

    if (!data) {
        return c.json({ error: 'Playlist not found.' }, 404);
    }

    return c.json({ data });
});

const createPlaylist = describeCreate({
    operationId: 'createPlaylist',
    tag: 'Playlists',
    summary: 'Create a playlist',
    description: 'Creates an empty playlist and returns it. Requires the admin role.',
    schema: playlistSchema,
    body: playlistCreateSchema,
});

playlistRoutes.post('/', describeRoute(createPlaylist), validator('json', playlistCreateSchema), async (c) => {
    const [data] = await db.insert(playlists).values(c.req.valid('json')).returning();

    return c.json({ data }, 201);
});

const updatePlaylist = describeUpdate({
    operationId: 'updatePlaylist',
    tag: 'Playlists',
    summary: 'Update a playlist',
    description:
        'Changes the given fields of the playlist with the given id and returns it. An unknown id returns 404. Requires the admin role.',
    schema: playlistSchema,
    body: playlistUpdateSchema,
});

playlistRoutes.patch(
    '/:id',
    describeRoute(updatePlaylist),
    validator('param', paramSchema),
    validator('json', playlistUpdateSchema),
    async (c) => {
        const { id } = c.req.valid('param');

        const [data] = await db.update(playlists).set(c.req.valid('json')).where(eq(playlists.id, id)).returning();

        if (!data) {
            return c.json({ error: 'Playlist not found.' }, 404);
        }

        return c.json({ data });
    },
);

const deletePlaylist = describeDelete({
    operationId: 'deletePlaylist',
    tag: 'Playlists',
    summary: 'Delete a playlist',
    description:
        'Removes the playlist with the given id, and its list of tracks, for good, and returns it. The tracks themselves are not touched. An unknown id returns 404. Requires the admin role.',
    schema: playlistSchema,
});

playlistRoutes.delete('/:id', describeRoute(deletePlaylist), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    // The database removes the playlist's rows in playlist_tracks with it.
    const [data] = await db.delete(playlists).where(eq(playlists.id, id)).returning();

    if (!data) {
        return c.json({ error: 'Playlist not found.' }, 404);
    }

    return c.json({ data });
});

export default playlistRoutes;
