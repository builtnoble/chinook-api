import { and, eq, getTableColumns, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import omit from 'lodash-es/omit';
import db from '@/db';
import { genres, tracks } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeCreate, describeDelete, describeList, describeUpdate } from '@/utils/openapi';
import { genreCreateSchema, genreSchema, genreUpdateSchema, paramSchema, querySchema } from '@/utils/schema';
import { countOf, httpError } from '@/utils/write';

const genreRoutes = new Hono();

// Deleting a genre sets deleted_at, so every read leaves those rows out and never returns the column.
const notDeleted = isNull(genres.deleted_at);
const withoutDeletedAt = { deleted_at: false } as const;

// What a write returns: the row as a read returns it.
const columns = omit(getTableColumns(genres), 'deleted_at');

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
    description: 'Returns the genre with the given id. An unknown or deleted id returns 404.',
    schema: genreSchema,
});

genreRoutes.get('/:id', describeRoute(getGenreByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.genres.findFirst({
        columns: withoutDeletedAt,
        where: and(eq(genres.id, id), notDeleted),
    });

    if (!data) {
        return c.json({ error: 'Genre not found.' }, 404);
    }

    return c.json({ data });
});

const createGenre = describeCreate({
    operationId: 'createGenre',
    tag: 'Genres',
    summary: 'Create a genre',
    description: 'Creates a genre and returns it. Requires the admin role.',
    schema: genreSchema,
    body: genreCreateSchema,
});

genreRoutes.post('/', describeRoute(createGenre), validator('json', genreCreateSchema), async (c) => {
    const [data] = await db.insert(genres).values(c.req.valid('json')).returning(columns);

    return c.json({ data }, 201);
});

const updateGenre = describeUpdate({
    operationId: 'updateGenre',
    tag: 'Genres',
    summary: 'Update a genre',
    description:
        'Changes the given fields of the genre with the given id and returns it. An unknown or deleted id returns 404. Requires the admin role.',
    schema: genreSchema,
    body: genreUpdateSchema,
});

genreRoutes.patch(
    '/:id',
    describeRoute(updateGenre),
    validator('param', paramSchema),
    validator('json', genreUpdateSchema),
    async (c) => {
        const { id } = c.req.valid('param');

        const [data] = await db
            .update(genres)
            .set(c.req.valid('json'))
            .where(and(eq(genres.id, id), notDeleted))
            .returning(columns);

        if (!data) {
            return c.json({ error: 'Genre not found.' }, 404);
        }

        return c.json({ data });
    },
);

const deleteGenre = describeDelete({
    operationId: 'deleteGenre',
    tag: 'Genres',
    summary: 'Delete a genre',
    description:
        'Deletes the genre with the given id and returns it. The genre is kept but no longer listed, so it cannot be deleted while a track still uses it: reassign or delete those tracks first. An unknown or deleted id returns 404. Requires the admin role.',
    schema: genreSchema,
    blockedBy: 'A track still uses the genre.',
});

genreRoutes.delete('/:id', describeRoute(deleteGenre), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.transaction(async (tx) => {
        // Locked first, so a track that is being added to the genre finishes before the tracks are counted.
        const [genre] = await tx
            .select({ id: genres.id })
            .from(genres)
            .where(and(eq(genres.id, id), notDeleted))
            .for('update');

        if (!genre) {
            throw httpError(404, 'Genre not found.');
        }

        const used = await tx.$count(tracks, and(eq(tracks.genre_id, id), isNull(tracks.deleted_at)));

        if (used) {
            throw httpError(409, `The genre is used by ${countOf(used, 'track')}. Reassign them first.`);
        }

        const [deleted] = await tx
            .update(genres)
            .set({ deleted_at: sql`now()` })
            .where(eq(genres.id, id))
            .returning(columns);

        return deleted;
    });

    return c.json({ data });
});

export default genreRoutes;
