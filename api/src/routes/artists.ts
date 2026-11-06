import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import db from '@/db';
import { albums, artists, tracks } from '@/db/chinookSchema';
import { problem } from '@/lib/problem-details';
import { paginateBy } from '@/middleware/paginationMiddleware';
import { describeByID, describeCreate, describeDelete, describeList, describeUpdate } from '@/openapi';
import { countOf } from '@/utils/helpers/countHelper';
import { artistsWhere } from '@/utils/helpers/filterHelper';
import { validate } from '@/utils/helpers/requestValidationHelper';
import { columnsWithoutDeletedAt, notDeleted, withoutDeletedAt } from '@/utils/helpers/softDeleteHelper';
import { type ArtistQuery, artistQuerySchema, cascadeQuerySchema, paramSchema } from '@/utils/schema/requestSchema';
import { artistCreateSchema, artistSchema, artistUpdateSchema } from '@/utils/schema/resources/artistSchema';

const artistRoutes = new Hono();

const getArtists = describeList({
    operationId: 'getArtists',
    tag: 'Artists',
    summary: 'List all artists',
    description:
        'Returns a paginated list of artists, ordered by id. Add `q` to search by name; the search is not ranked.',
    schema: artistSchema,
    path: '/api/artists',
});

artistRoutes.get(
    '/',
    describeRoute(getArtists),
    validate('query', artistQuerySchema),
    paginateBy<ArtistQuery>((query) => db.$count(artists, artistsWhere(query))),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const rows = await db.query.artists.findMany({
            columns: withoutDeletedAt,
            where: artistsWhere(c.req.valid('query')),
            orderBy: (artists, { asc }) => asc(artists.id),
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

artistRoutes.get('/:id', describeRoute(getArtistByID), validate('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.artists.findFirst({
        columns: withoutDeletedAt,
        where: and(eq(artists.id, id), notDeleted(artists)),
    });

    if (!data) {
        throw problem(404, 'Artist not found.');
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

artistRoutes.post('/', describeRoute(createArtist), validate('json', artistCreateSchema), async (c) => {
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
    validate('param', paramSchema),
    validate('json', artistUpdateSchema),
    async (c) => {
        const { id } = c.req.valid('param');

        const [data] = await db
            .update(artists)
            .set(c.req.valid('json'))
            .where(and(eq(artists.id, id), notDeleted(artists)))
            .returning(columnsWithoutDeletedAt(artists));

        if (!data) {
            throw problem(404, 'Artist not found.');
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
    blockedExample: 'The artist has 2 albums. Delete them first, or pass cascade=true.',
});

artistRoutes.delete(
    '/:id',
    describeRoute(deleteArtist),
    validate('param', paramSchema),
    validate('query', cascadeQuerySchema),
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
                throw problem(404, 'Artist not found.');
            }

            const liveAlbums = await tx
                .select({ id: albums.id })
                .from(albums)
                .where(and(eq(albums.artist_id, id), isNull(albums.deleted_at)))
                .for('update');

            if (liveAlbums.length && !cascade) {
                throw problem(
                    409,
                    `The artist has ${countOf(liveAlbums.length, 'album')}. Delete them first, or pass cascade=true.`,
                    { code: 'delete_blocked' },
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
