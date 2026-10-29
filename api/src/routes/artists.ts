import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { artists } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeList } from '@/utils/openapi';
import { artistSchema, paramSchema, querySchema } from '@/utils/schema';

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

        const artists = await db.query.artists.findMany({
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
    summary: 'Retrieve a artist',
    description: 'Returns the artist with the given id. An unknown id returns 200 with no `data`.',
    schema: artistSchema,
});

artistRoutes.get('/:id', describeRoute(getArtistByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.artists.findFirst({
        where: eq(artists.id, id),
    });

    return c.json({ data });
});

export default artistRoutes;
