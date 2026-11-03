import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { albums, artists, tracks } from '@/db/chinookSchema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { countOf } from '@/utils/helpers';
import { httpError } from '@/utils/httpError';
import { describeByID, describeCreate, describeDelete, describeList, describeUpdate } from '@/utils/openapi';
import { cascadeQuerySchema, paramSchema, querySchema } from '@/utils/schema/requestSchema';
import { artistCreateSchema, artistSchema, artistUpdateSchema } from '@/utils/schema/resources/artistSchema';
import { columnsWithoutDeletedAt, notDeleted, withoutDeletedAt } from '@/utils/softDelete';

const artistRoutes = new Hono();

const getArtists = describeList({
    operationId: 'getArtists',
    tag: 'Artists',
    summary: 'List all artists',
    description: 'Returns a paginated list of artists.',
    schema: artistSchema,
    path: '/api/artists',
});

artistRoutes.get(
    '/',
    describeRoute(getArtists),
    validator('query', querySchema),
    paginationMiddleware(artists),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const rows = await db.query.artists.findMany({
            columns: withoutDeletedAt,
            where: notDeleted(artists),
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: rows,
            pagination,
        });
    },
);

const getArtistByID = describeByID({
    operationId: 'getArtistByID',
    tag: 'Artists',
    summary: 'Retrieve an artist',
    description: 'Returns the artist with the given id. An unknown or deleted id returns 404.',
    schema: artistSchema,
});

artistRoutes.get('/:id', describeRoute(getArtistByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.artists.findFirst({
        columns: withoutDeletedAt,
        where: and(eq(artists.id, id), notDeleted(artists)),
    });

    if (!data) {
        return c.json({ error: 'Artist not found.' }, 404);
    }

    return c.json({ data });
});

const createArtist = describeCreate({
    operationId: 'createArtist',
    tag: 'Artists',
    summary: 'Create an artist',
    description: 'Creates an artist and returns it. Requires the admin role.',
    schema: artistSchema,
    body: artistCreateSchema,
});

artistRoutes.post('/', describeRoute(createArtist), validator('json', artistCreateSchema), async (c) => {
    const [data] = await db.insert(artists).values(c.req.valid('json')).returning(columnsWithoutDeletedAt(artists));

    return c.json({ data }, 201);
});

const updateArtist = describeUpdate({
    operationId: 'updateArtist',
    tag: 'Artists',
    summary: 'Update an artist',
    description:
        'Changes the given fields of the artist with the given id and returns it. An unknown or deleted id returns 404. Requires the admin role.',
    schema: artistSchema,
    body: artistUpdateSchema,
});

artistRoutes.patch(
    '/:id',
    describeRoute(updateArtist),
    validator('param', paramSchema),
    validator('json', artistUpdateSchema),
    async (c) => {
        const { id } = c.req.valid('param');

        const [data] = await db
            .update(artists)
            .set(c.req.valid('json'))
            .where(and(eq(artists.id, id), notDeleted(artists)))
            .returning(columnsWithoutDeletedAt(artists));

        if (!data) {
            return c.json({ error: 'Artist not found.' }, 404);
        }

        return c.json({ data });
    },
);

const deleteArtist = describeDelete({
    operationId: 'deleteArtist',
    tag: 'Artists',
    summary: 'Delete an artist',
    description:
        'Deletes the artist with the given id and returns it. The artist is kept but no longer listed. While the artist has albums the delete is refused with 409, unless `cascade=true`, which deletes their albums and the tracks on them too, all or nothing. An unknown or deleted id returns 404. Requires the admin role.',
    schema: artistSchema,
    blockedBy: 'The artist still has albums, and `cascade=true` was not passed.',
});

artistRoutes.delete(
    '/:id',
    describeRoute(deleteArtist),
    validator('param', paramSchema),
    validator('query', cascadeQuerySchema),
    async (c) => {
        const { id } = c.req.valid('param');
        const cascade = c.req.valid('query').cascade === 'true';

        const data = await db.transaction(async (tx) => {
            // The artist and then its albums are locked, so an album or a track
            // being added under them finishes first and is counted, and nothing
            // can be added once they are deleted.
            const [artist] = await tx
                .select({ id: artists.id })
                .from(artists)
                .where(and(eq(artists.id, id), notDeleted(artists)))
                .for('update');

            if (!artist) {
                throw httpError(404, 'Artist not found.');
            }

            const liveAlbums = await tx
                .select({ id: albums.id })
                .from(albums)
                .where(and(eq(albums.artist_id, id), isNull(albums.deleted_at)))
                .for('update');

            if (liveAlbums.length && !cascade) {
                throw httpError(
                    409,
                    `The artist has ${countOf(liveAlbums.length, 'album')}. Delete them first, or pass cascade=true.`,
                );
            }

            if (liveAlbums.length) {
                const albumIds = liveAlbums.map((album) => album.id);

                await tx
                    .update(tracks)
                    .set({ deleted_at: sql`now()` })
                    .where(and(inArray(tracks.album_id, albumIds), isNull(tracks.deleted_at)));
                await tx.update(albums).set({ deleted_at: sql`now()` }).where(inArray(albums.id, albumIds));
            }

            const [deleted] = await tx
                .update(artists)
                .set({ deleted_at: sql`now()` })
                .where(eq(artists.id, id))
                .returning(columnsWithoutDeletedAt(artists));

            return deleted;
        });

        return c.json({ data });
    },
);

export default artistRoutes;
