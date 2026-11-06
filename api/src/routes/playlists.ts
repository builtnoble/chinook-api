import { and, eq, inArray } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import db from '@/db';
import { playlist_tracks, playlists, tracks } from '@/db/chinookSchema';
import { problem } from '@/lib/problem-details';
import { paginateBy } from '@/middleware/paginationMiddleware';
import { describeByID, describeCreate, describeDelete, describeList, describeUpdate } from '@/openapi';
import { playlistsWhere, tracksWhere } from '@/utils/helpers/filterHelper';
import { validate } from '@/utils/helpers/requestValidationHelper';
import { requireLiveParent, withoutDeletedAt } from '@/utils/helpers/softDeleteHelper';
import { withTrackRelations } from '@/utils/helpers/trackHelper';
import {
    type PlaylistQuery,
    paramSchema,
    playlistQuerySchema,
    type TrackQuery,
    trackQuerySchema,
} from '@/utils/schema/requestSchema';
import { playlistCreateSchema, playlistSchema, playlistUpdateSchema } from '@/utils/schema/resources/playlistSchema';
import {
    playlistTrackCreateSchema,
    playlistTrackParamSchema,
    playlistTrackSchema,
} from '@/utils/schema/resources/playlistTrackSchema';
import { trackSchema } from '@/utils/schema/resources/trackSchema';

const playlistRoutes = new Hono();

// Builds a subquery without a connection, so a condition only describes a query.
const qb = new QueryBuilder();

const getPlaylists = describeList({
    operationId: 'getPlaylists',
    tag: 'Playlists',
    summary: 'List all playlists',
    description:
        'Returns a paginated list of playlists, ordered by id. Add `q` to search by name; the search is not ranked.',
    schema: playlistSchema,
    path: '/api/playlists',
});

playlistRoutes.get(
    '/',
    describeRoute(getPlaylists),
    validate('query', playlistQuerySchema),
    paginateBy<PlaylistQuery>((query) => db.$count(playlists, playlistsWhere(query))),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const playlists = await db.query.playlists.findMany({
            where: playlistsWhere(c.req.valid('query')),
            orderBy: (playlists, { asc }) => asc(playlists.id),
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

playlistRoutes.get('/:id', describeRoute(getPlaylistByID), validate('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.playlists.findFirst({
        where: eq(playlists.id, id),
    });

    if (!data) {
        throw problem(404, 'Playlist not found.');
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

playlistRoutes.post('/', describeRoute(createPlaylist), validate('json', playlistCreateSchema), async (c) => {
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
    validate('param', paramSchema),
    validate('json', playlistUpdateSchema),
    async (c) => {
        const { id } = c.req.valid('param');

        const [data] = await db.update(playlists).set(c.req.valid('json')).where(eq(playlists.id, id)).returning();

        if (!data) {
            throw problem(404, 'Playlist not found.');
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

playlistRoutes.delete('/:id', describeRoute(deletePlaylist), validate('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    // The database removes the playlist's rows in playlist_tracks with it.
    const [data] = await db.delete(playlists).where(eq(playlists.id, id)).returning();

    if (!data) {
        throw problem(404, 'Playlist not found.');
    }

    return c.json({ data });
});

const getPlaylistTracks = describeList({
    operationId: 'getPlaylistTracks',
    tag: 'Playlists',
    summary: 'List the tracks in a playlist',
    description:
        'Returns a paginated list of the tracks in the playlist with the given id, ordered by track id. Each track includes its album (with the album artist), genre and media type. Deleted tracks are left out. It takes the same `q`, `album_id`, `genre_id` and `media_type_id` filters as `GET /api/tracks`. An unknown id returns 404.',
    schema: trackSchema,
    path: '/api/playlists/1/tracks',
    parent: true,
});

// The tracks of the playlist that pass the filters, for both the count and the
// list.
const playlistTracksWhere = (id: number, query: TrackQuery) =>
    and(
        tracksWhere(query),
        inArray(
            tracks.id,
            qb
                .select({ id: playlist_tracks.track_id })
                .from(playlist_tracks)
                .where(eq(playlist_tracks.playlist_id, id)),
        ),
    );

// The playlist must exist, so one with no tracks, or none that pass the
// filters, is an empty page and not a 404.
const countPlaylistTracks = paginateBy<TrackQuery>(async (query, c) => {
    const id = Number(c.req.param('id'));

    const [playlist] = await db.select({ id: playlists.id }).from(playlists).where(eq(playlists.id, id));

    if (!playlist) {
        throw problem(404, 'Playlist not found.');
    }

    return db.$count(tracks, playlistTracksWhere(id, query));
});

playlistRoutes.get(
    '/:id/tracks',
    describeRoute(getPlaylistTracks),
    validate('param', paramSchema),
    validate('query', trackQuerySchema),
    countPlaylistTracks,
    async (c) => {
        const { id } = c.req.valid('param');
        const { offset, ...pagination } = c.get('pagination');

        const rows = await db.query.tracks.findMany({
            columns: withoutDeletedAt,
            where: playlistTracksWhere(id, c.req.valid('query')),
            orderBy: (tracks, { asc }) => asc(tracks.id),
            with: withTrackRelations,
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: rows,
            pagination,
        });
    },
);

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
    validate('param', paramSchema),
    validate('json', playlistTrackCreateSchema),
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
                throw problem(404, 'Playlist not found.');
            }

            await requireLiveParent(tx, tracks, track_id, 'track_id', 'track');

            const [added] = await tx
                .insert(playlist_tracks)
                .values({ playlist_id: id, track_id })
                .onConflictDoNothing()
                .returning();

            if (!added) {
                throw problem(409, 'The track is already in the playlist.', { code: 'duplicate_value' });
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
    validate('param', playlistTrackParamSchema),
    async (c) => {
        const { id, track_id } = c.req.valid('param');

        const [data] = await db
            .delete(playlist_tracks)
            .where(and(eq(playlist_tracks.playlist_id, id), eq(playlist_tracks.track_id, track_id)))
            .returning();

        if (!data) {
            throw problem(404, 'The playlist does not contain that track.');
        }

        return c.json({ data });
    },
);

export default playlistRoutes;
