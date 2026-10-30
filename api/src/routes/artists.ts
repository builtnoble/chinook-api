import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { artists } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeList } from '@/utils/openapi';
import { artistSchema, paramSchema, querySchema } from '@/utils/schema';

const artistRoutes = new Hono();

// Deleting an artist sets deleted_at, so every read leaves those rows out and never returns the column.
const notDeleted = isNull(artists.deleted_at);
const withoutDeletedAt = { deleted_at: false } as const;

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

        const artists = await db.query.artists.findMany({
            columns: withoutDeletedAt,
            where: notDeleted,
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: artists,
            pagination,
        });
    },
);

const getArtistByID = describeByID({
    operationId: 'getArtistByID',
    tag: 'Artists',
    summary: 'Retrieve an artist',
    description: 'Returns the artist with the given id. An unknown id returns 200 with no `data`.',
    schema: artistSchema,
});

artistRoutes.get('/:id', describeRoute(getArtistByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.artists.findFirst({
        columns: withoutDeletedAt,
        where: and(eq(artists.id, id), notDeleted),
    });

    return c.json({ data });
});

export default artistRoutes;
