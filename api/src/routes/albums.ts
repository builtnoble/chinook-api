import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { albums } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeList } from '@/utils/openapi';
import { albumSchema, paramSchema, querySchema } from '@/utils/schema';

const albumRoutes = new Hono();

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
            with: {
                artist: true,
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
    summary: 'Retrieve a album',
    description:
        'Returns the album with the given id. The album includes its artist. An unknown id returns 200 with no `data`.',
    schema: albumSchema,
});

albumRoutes.get('/:id', describeRoute(getAlbumByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.albums.findFirst({
        where: eq(albums.id, id),
        with: {
            artist: true,
        },
    });

    return c.json({ data });
});

export default albumRoutes;
