import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { playlist_tracks, playlists, tracks } from '@/db/chinookSchema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeCreate, describeDelete, describeList, describeUpdate } from '@/utils/openapi';
import { paramSchema, querySchema } from '@/utils/schema/requestSchema';
import { playlistCreateSchema, playlistSchema, playlistUpdateSchema } from '@/utils/schema/resources/playlistSchema';
import {
    playlistTrackCreateSchema,
    playlistTrackParamSchema,
    playlistTrackSchema,
} from '@/utils/schema/resources/playlistTrackSchema';
import { httpError, requireLiveParent } from '@/utils/write';

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

const addPlaylistTrack = describeCreate({
    operationId: 'addPlaylistTrack',
    tag: 'Playlists',
    summary: 'Add a track to a playlist',
    description:
        'Adds the track to the playlist with the given id. Adding a track that is already in the playlist returns 409, an unknown playlist returns 404, and a `track_id` that does not exist or is deleted returns 422. Requires the admin role.',
    schema: playlistTrackSchema,
    body: playlistTrackCreateSchema,
    parent: true,
});

playlistRoutes.post(
    '/:id/tracks',
    describeRoute(addPlaylistTrack),
    validator('param', paramSchema),
    validator('json', playlistTrackCreateSchema),
    async (c) => {
        const { id } = c.req.valid('param');
        const { track_id } = c.req.valid('json');

        const data = await db.transaction(async (tx) => {
            // Share-locked, so the playlist cannot be deleted while the track
            // is added to it.
            const [playlist] = await tx
                .select({ id: playlists.id })
                .from(playlists)
                .where(eq(playlists.id, id))
                .for('share');

            if (!playlist) {
                throw httpError(404, 'Playlist not found.');
            }

            await requireLiveParent(tx, tracks, track_id, 'track_id', 'track');

            const [added] = await tx
                .insert(playlist_tracks)
                .values({ playlist_id: id, track_id })
                .onConflictDoNothing()
                .returning();

            if (!added) {
                throw httpError(409, 'The track is already in the playlist.');
            }

            return added;
        });

        return c.json({ data }, 201);
    },
);

const removePlaylistTrack = describeDelete({
    operationId: 'removePlaylistTrack',
    tag: 'Playlists',
    summary: 'Remove a track from a playlist',
    description:
        'Removes the track from the playlist with the given id and returns the entry that was removed. The track itself is not touched. A track that is not in the playlist, or an unknown playlist, returns 404. Requires the admin role.',
    schema: playlistTrackSchema,
    notFoundError: 'The playlist does not contain that track.',
});

playlistRoutes.delete(
    '/:id/tracks/:track_id',
    describeRoute(removePlaylistTrack),
    validator('param', playlistTrackParamSchema),
    async (c) => {
        const { id, track_id } = c.req.valid('param');

        const [data] = await db
            .delete(playlist_tracks)
            .where(and(eq(playlist_tracks.playlist_id, id), eq(playlist_tracks.track_id, track_id)))
            .returning();

        if (!data) {
            return c.json({ error: 'The playlist does not contain that track.' }, 404);
        }

        return c.json({ data });
    },
);

export default playlistRoutes;
