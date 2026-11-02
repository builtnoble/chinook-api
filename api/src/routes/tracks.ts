import { and, eq, type SQL, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { albums, genres, media_types, tracks } from '@/db/chinookSchema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeCreate, describeDelete, describeList, describeUpdate } from '@/utils/openapi';
import { paramSchema, querySchema } from '@/utils/schema/requestSchema';
import { trackCreateSchema, trackSchema, trackUpdateSchema } from '@/utils/schema/resources/trackSchema';
import { notDeleted, withoutDeletedAt } from '@/utils/softDelete';
import { httpError, requireLiveParent, type Transaction } from '@/utils/write';

const trackRoutes = new Hono();

// A track as every read and write returns it, with its album (and the album's
// artist), genre and media type.
const findTrack = (executor: Pick<typeof db, 'query'>, where: SQL) =>
    executor.query.tracks.findFirst({
        columns: withoutDeletedAt,
        where,
        with: {
            album: {
                columns: withoutDeletedAt,
                with: {
                    artist: { columns: withoutDeletedAt },
                },
            },
            genre: { columns: withoutDeletedAt },
            media_type: { columns: withoutDeletedAt },
        },
    });

type References = { album_id?: number | null; genre_id?: number | null; media_type_id?: number };

// Each reference a write sets must be live: an unset or null album or genre is
// allowed, a media type is required. The parents are always locked in this
// order.
const requireLiveReferences = async (tx: Transaction, { album_id, genre_id, media_type_id }: References) => {
    if (album_id != null) {
        await requireLiveParent(tx, albums, album_id, 'album_id', 'album');
    }

    if (genre_id != null) {
        await requireLiveParent(tx, genres, genre_id, 'genre_id', 'genre');
    }

    if (media_type_id !== undefined) {
        await requireLiveParent(tx, media_types, media_type_id, 'media_type_id', 'media type');
    }
};

const getTracks = describeList({
    operationId: 'getTracks',
    tag: 'Tracks',
    summary: 'List all tracks',
    description:
        'Returns a paginated list of tracks. Each track includes its album (with the album artist), genre and media type, ordered by id.',
    schema: trackSchema,
    path: '/api/tracks',
});

trackRoutes.get(
    '/',
    describeRoute(getTracks),
    validator('query', querySchema),
    paginationMiddleware(tracks),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const rows = await db.query.tracks.findMany({
            columns: withoutDeletedAt,
            where: notDeleted(tracks),
            orderBy: (albums, { asc }) => asc(albums.id),
            with: {
                album: {
                    columns: withoutDeletedAt,
                    with: {
                        artist: { columns: withoutDeletedAt },
                    },
                },
                genre: { columns: withoutDeletedAt },
                media_type: { columns: withoutDeletedAt },
            },
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: rows,
            pagination,
        });
    },
);

const getTrackByID = describeByID({
    operationId: 'getTrackByID',
    tag: 'Tracks',
    summary: 'Retrieve a track',
    description:
        'Returns the track with the given id. The track includes its album (with the album artist), genre and media type. An unknown or deleted id returns 404.',
    schema: trackSchema,
});

trackRoutes.get('/:id', describeRoute(getTrackByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await findTrack(db, and(eq(tracks.id, id), notDeleted(tracks)) as SQL);

    if (!data) {
        return c.json({ error: 'Track not found.' }, 404);
    }

    return c.json({ data });
});

const createTrack = describeCreate({
    operationId: 'createTrack',
    tag: 'Tracks',
    summary: 'Create a track',
    description:
        'Creates a track and returns it with its album (with the album artist), genre and media type. An `album_id`, `genre_id` or `media_type_id` that does not exist, or is deleted, returns 422. Requires the admin role.',
    schema: trackSchema,
    body: trackCreateSchema,
});

trackRoutes.post('/', describeRoute(createTrack), validator('json', trackCreateSchema), async (c) => {
    const body = c.req.valid('json');

    const data = await db.transaction(async (tx) => {
        await requireLiveReferences(tx, body);

        const [created] = await tx.insert(tracks).values(body).returning({ id: tracks.id });

        return findTrack(tx, eq(tracks.id, created.id));
    });

    return c.json({ data }, 201);
});

const updateTrack = describeUpdate({
    operationId: 'updateTrack',
    tag: 'Tracks',
    summary: 'Update a track',
    description:
        'Changes the given fields of the track with the given id and returns it with its album (with the album artist), genre and media type. An unknown or deleted id returns 404, and an `album_id`, `genre_id` or `media_type_id` that does not exist or is deleted returns 422. Requires the admin role.',
    schema: trackSchema,
    body: trackUpdateSchema,
});

trackRoutes.patch(
    '/:id',
    describeRoute(updateTrack),
    validator('param', paramSchema),
    validator('json', trackUpdateSchema),
    async (c) => {
        const { id } = c.req.valid('param');
        const body = c.req.valid('json');

        const data = await db.transaction(async (tx) => {
            const live = and(eq(tracks.id, id), notDeleted(tracks)) as SQL;

            if (!(await findTrack(tx, live))) {
                throw httpError(404, 'Track not found.');
            }

            await requireLiveReferences(tx, body);

            const updated = await tx.update(tracks).set(body).where(live).returning({ id: tracks.id });

            if (!updated.length) {
                throw httpError(404, 'Track not found.');
            }

            return findTrack(tx, eq(tracks.id, id));
        });

        return c.json({ data });
    },
);

const deleteTrack = describeDelete({
    operationId: 'deleteTrack',
    tag: 'Tracks',
    summary: 'Delete a track',
    description:
        'Deletes the track with the given id and returns it with its album (with the album artist), genre and media type. The track is kept but no longer listed or found, so invoices that include it stay intact, and playlists keep their entry for it. An unknown or deleted id returns 404. Requires the admin role.',
    schema: trackSchema,
});

trackRoutes.delete('/:id', describeRoute(deleteTrack), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.transaction(async (tx) => {
        const deleted = await tx
            .update(tracks)
            .set({ deleted_at: sql`now()` })
            .where(and(eq(tracks.id, id), notDeleted(tracks)))
            .returning({ id: tracks.id });

        if (!deleted.length) {
            throw httpError(404, 'Track not found.');
        }

        return findTrack(tx, eq(tracks.id, id));
    });

    return c.json({ data });
});

export default trackRoutes;
