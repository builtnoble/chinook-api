import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { albums } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeList } from '@/utils/openapi';
import { albumSchema, paramSchema, querySchema } from '@/utils/schema';

const albumRoutes = new Hono();

// Deleting an album sets deleted_at, so every read leaves those rows out and never returns the column.
const notDeleted = isNull(albums.deleted_at);
const withoutDeletedAt = { deleted_at: false } as const;

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
    validator('query', querySchema),
    paginationMiddleware(albums),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const albums = await db.query.albums.findMany({
            columns: withoutDeletedAt,
            where: notDeleted,
            with: {
                artist: { columns: withoutDeletedAt },
            },
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: albums,
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

albumRoutes.get('/:id', describeRoute(getAlbumByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.albums.findFirst({
        columns: withoutDeletedAt,
        where: and(eq(albums.id, id), notDeleted),
        with: {
            artist: { columns: withoutDeletedAt },
        },
    });

    if (!data) {
        return c.json({ error: 'Album not found.' }, 404);
    }

    return c.json({ data });
});

export default albumRoutes;
