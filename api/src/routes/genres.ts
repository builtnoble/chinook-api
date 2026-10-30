import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { genres } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeList } from '@/utils/openapi';
import { genreSchema, paramSchema, querySchema } from '@/utils/schema';

const genreRoutes = new Hono();

// Deleting a genre sets deleted_at, so every read leaves those rows out and never returns the column.
const notDeleted = isNull(genres.deleted_at);
const withoutDeletedAt = { deleted_at: false } as const;

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
            columns: withoutDeletedAt,
            where: notDeleted,
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
        columns: withoutDeletedAt,
        where: and(eq(genres.id, id), notDeleted),
    });

    return c.json({ data });
});

export default genreRoutes;
