import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { genres } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeList } from '@/utils/openapi';
import { genreSchema, paramSchema, querySchema } from '@/utils/schema';

const genreRoutes = new Hono();

const getGenres = describeList({
    operationId: 'getGenres',
    tag: 'Genres',
    summary: 'List all genres',
    description: 'Returns a paginated list of genres.',
    schema: genreSchema,
    path: '/api/genres',
});

genreRoutes.get(
    '/',
    describeRoute(getGenres),
    validator('query', querySchema),
    paginationMiddleware(genres),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const genres = await db.query.genres.findMany({
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: genres,
            pagination,
        });
    },
);

const getGenreByID = describeByID({
    operationId: 'getGenreByID',
    tag: 'Genres',
    summary: 'Retrieve a genre',
    description: 'Returns the genre with the given id. An unknown id returns 200 with no `data`.',
    schema: genreSchema,
});

genreRoutes.get('/:id', describeRoute(getGenreByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.genres.findFirst({
        where: eq(genres.id, id),
    });

    return c.json({ data });
});

export default genreRoutes;
