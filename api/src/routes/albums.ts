import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import db from '@/db';
import { albums, artists, tracks } from '@/db/chinookSchema';
import { problem } from '@/lib/problem-details';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { countOf } from '@/utils/helpers/countHelper';
import { validate } from '@/utils/helpers/requestValidationHelper';
import { notDeleted, requireLiveParent, withoutDeletedAt } from '@/utils/helpers/softDeleteHelper';
import { describeByID, describeCreate, describeDelete, describeList, describeUpdate } from '@/utils/openapi';
import { cascadeQuerySchema, paramSchema, querySchema } from '@/utils/schema/requestSchema';
import { albumCreateSchema, albumSchema, albumUpdateSchema } from '@/utils/schema/resources/albumSchema';

const albumRoutes = new Hono();

// An album as every read and write returns it, with its artist.
const findAlbum = (executor: Pick<typeof db, 'query'>, where: SQL) =>
    executor.query.albums.findFirst({
        columns: withoutDeletedAt,
        where,
        with: { artist: { columns: withoutDeletedAt } },
    });

const getAlbums = describeList({
    operationId: 'getAlbums',
    tag: 'Albums',
    summary: 'List all albums',
    description: 'Returns a paginated list of albums. Each album includes its artist.',
    schema: albumSchema,
    path: '/api/albums',
});

albumRoutes.get(
    '/',
    describeRoute(getAlbums),
    validate('query', querySchema),
    paginationMiddleware(albums),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const rows = await db.query.albums.findMany({
            columns: withoutDeletedAt,
            where: notDeleted(albums),
            with: {
                artist: { columns: withoutDeletedAt },
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

const getAlbumByID = describeByID({
    operationId: 'getAlbumByID',
    tag: 'Albums',
    summary: 'Retrieve an album',
    description:
        'Returns the album with the given id. The album includes its artist. An unknown or deleted id returns 404.',
    schema: albumSchema,
});

albumRoutes.get('/:id', describeRoute(getAlbumByID), validate('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await findAlbum(db, and(eq(albums.id, id), notDeleted(albums)) as SQL);

    if (!data) {
        throw problem(404, 'Album not found.');
    }

    return c.json({ data });
});

const createAlbum = describeCreate({
    operationId: 'createAlbum',
    tag: 'Albums',
    summary: 'Create an album',
    description:
        'Creates an album for an existing artist and returns it with its artist. An `artist_id` that does not exist, or whose artist is deleted, returns 422. Requires the admin role.',
    schema: albumSchema,
    body: albumCreateSchema,
});

albumRoutes.post('/', describeRoute(createAlbum), validate('json', albumCreateSchema), async (c) => {
    const body = c.req.valid('json');

    const data = await db.transaction(async (tx) => {
        await requireLiveParent(tx, artists, body.artist_id, 'artist_id', 'artist');

        const [created] = await tx.insert(albums).values(body).returning({ id: albums.id });

        return findAlbum(tx, eq(albums.id, created.id));
    });

    return c.json({ data }, 201);
});

const updateAlbum = describeUpdate({
    operationId: 'updateAlbum',
    tag: 'Albums',
    summary: 'Update an album',
    description:
        'Changes the given fields of the album with the given id and returns it with its artist. An unknown or deleted id returns 404, and an `artist_id` that does not exist or is deleted returns 422. Requires the admin role.',
    schema: albumSchema,
    body: albumUpdateSchema,
});

albumRoutes.patch(
    '/:id',
    describeRoute(updateAlbum),
    validate('param', paramSchema),
    validate('json', albumUpdateSchema),
    async (c) => {
        const { id } = c.req.valid('param');
        const body = c.req.valid('json');

        const data = await db.transaction(async (tx) => {
            const live = and(eq(albums.id, id), notDeleted(albums)) as SQL;

            if (!(await findAlbum(tx, live))) {
                throw problem(404, 'Album not found.');
            }

            // The parent is locked before the album, as a delete of the artist
            // does, so the two cannot wait on each other.
            if (body.artist_id !== undefined) {
                await requireLiveParent(tx, artists, body.artist_id, 'artist_id', 'artist');
            }

            const updated = await tx.update(albums).set(body).where(live).returning({ id: albums.id });

            if (!updated.length) {
                throw problem(404, 'Album not found.');
            }

            return findAlbum(tx, eq(albums.id, id));
        });

        return c.json({ data });
    },
);

const deleteAlbum = describeDelete({
    operationId: 'deleteAlbum',
    tag: 'Albums',
    summary: 'Delete an album',
    description:
        'Deletes the album with the given id and returns it with its artist. The album is kept but no longer listed. While the album has tracks the delete is refused with 409, unless `cascade=true`, which deletes the tracks too, all or nothing. An unknown or deleted id returns 404. Requires the admin role.',
    schema: albumSchema,
    blockedBy: 'The album still has tracks, and `cascade=true` was not passed.',
    blockedExample: 'The album has 12 tracks. Delete them first, or pass cascade=true.',
});

albumRoutes.delete(
    '/:id',
    describeRoute(deleteAlbum),
    validate('param', paramSchema),
    validate('query', cascadeQuerySchema),
    async (c) => {
        const { id } = c.req.valid('param');
        const cascade = c.req.valid('query').cascade === 'true';

        const data = await db.transaction(async (tx) => {
            // Locked first, so a track being added to the album finishes before
            // the tracks are counted.
            const [album] = await tx
                .select({ id: albums.id })
                .from(albums)
                .where(and(eq(albums.id, id), notDeleted(albums)))
                .for('update');

            if (!album) {
                throw problem(404, 'Album not found.');
            }

            const liveTracks = await tx.$count(tracks, and(eq(tracks.album_id, id), isNull(tracks.deleted_at)));

            if (liveTracks && !cascade) {
                throw problem(
                    409,
                    `The album has ${countOf(liveTracks, 'track')}. Delete them first, or pass cascade=true.`,
                    { code: 'delete_blocked' },
                );
            }

            if (liveTracks) {
                await tx
                    .update(tracks)
                    .set({ deleted_at: sql`now()` })
                    .where(and(eq(tracks.album_id, id), isNull(tracks.deleted_at)));
            }

            await tx.update(albums).set({ deleted_at: sql`now()` }).where(eq(albums.id, id));

            return findAlbum(tx, eq(albums.id, id));
        });

        return c.json({ data });
    },
);

export default albumRoutes;
