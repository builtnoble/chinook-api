import { and, eq, getTableColumns, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import omit from 'lodash-es/omit';
import db from '@/db';
import { media_types, tracks } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeCreate, describeDelete, describeList, describeUpdate } from '@/utils/openapi';
import {
    mediaTypeCreateSchema,
    mediaTypeSchema,
    mediaTypeUpdateSchema,
    paramSchema,
    querySchema,
} from '@/utils/schema';
import { countOf, httpError } from '@/utils/write';

const mediaTypeRoutes = new Hono();

// Deleting a media type sets deleted_at, so every read leaves those rows out and never returns the column.
const notDeleted = isNull(media_types.deleted_at);
const withoutDeletedAt = { deleted_at: false } as const;

// What a write returns: the row as a read returns it.
const columns = omit(getTableColumns(media_types), 'deleted_at');

const getMediaTypes = describeList({
    operationId: 'getMediaTypes',
    tag: 'Media Types',
    summary: 'List all media types',
    description: 'Returns a paginated list of media types.',
    schema: mediaTypeSchema,
    path: '/api/media-types',
});

mediaTypeRoutes.get(
    '/',
    describeRoute(getMediaTypes),
    validator('query', querySchema),
    paginationMiddleware(media_types),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const mediaTypes = await db.query.media_types.findMany({
            columns: withoutDeletedAt,
            where: notDeleted,
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: mediaTypes,
            pagination,
        });
    },
);

const getMediaTypeByID = describeByID({
    operationId: 'getMediaTypeByID',
    tag: 'Media Types',
    summary: 'Retrieve a media type',
    description: 'Returns the media type with the given id. An unknown or deleted id returns 404.',
    schema: mediaTypeSchema,
});

mediaTypeRoutes.get('/:id', describeRoute(getMediaTypeByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.media_types.findFirst({
        columns: withoutDeletedAt,
        where: and(eq(media_types.id, id), notDeleted),
    });

    if (!data) {
        return c.json({ error: 'Media type not found.' }, 404);
    }

    return c.json({ data });
});

const createMediaType = describeCreate({
    operationId: 'createMediaType',
    tag: 'Media Types',
    summary: 'Create a media type',
    description: 'Creates a media type and returns it. Requires the admin role.',
    schema: mediaTypeSchema,
    body: mediaTypeCreateSchema,
});

mediaTypeRoutes.post('/', describeRoute(createMediaType), validator('json', mediaTypeCreateSchema), async (c) => {
    const [data] = await db.insert(media_types).values(c.req.valid('json')).returning(columns);

    return c.json({ data }, 201);
});

const updateMediaType = describeUpdate({
    operationId: 'updateMediaType',
    tag: 'Media Types',
    summary: 'Update a media type',
    description:
        'Changes the given fields of the media type with the given id and returns it. An unknown or deleted id returns 404. Requires the admin role.',
    schema: mediaTypeSchema,
    body: mediaTypeUpdateSchema,
});

mediaTypeRoutes.patch(
    '/:id',
    describeRoute(updateMediaType),
    validator('param', paramSchema),
    validator('json', mediaTypeUpdateSchema),
    async (c) => {
        const { id } = c.req.valid('param');

        const [data] = await db
            .update(media_types)
            .set(c.req.valid('json'))
            .where(and(eq(media_types.id, id), notDeleted))
            .returning(columns);

        if (!data) {
            return c.json({ error: 'Media type not found.' }, 404);
        }

        return c.json({ data });
    },
);

const deleteMediaType = describeDelete({
    operationId: 'deleteMediaType',
    tag: 'Media Types',
    summary: 'Delete a media type',
    description:
        'Deletes the media type with the given id and returns it. The media type is kept but no longer listed, so it cannot be deleted while a track still uses it: reassign or delete those tracks first. An unknown or deleted id returns 404. Requires the admin role.',
    schema: mediaTypeSchema,
    blockedBy: 'A track still uses the media type.',
});

mediaTypeRoutes.delete('/:id', describeRoute(deleteMediaType), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.transaction(async (tx) => {
        // Locked first, so a track that is being added to the media type finishes before the tracks are counted.
        const [mediaType] = await tx
            .select({ id: media_types.id })
            .from(media_types)
            .where(and(eq(media_types.id, id), notDeleted))
            .for('update');

        if (!mediaType) {
            throw httpError(404, 'Media type not found.');
        }

        const used = await tx.$count(tracks, and(eq(tracks.media_type_id, id), isNull(tracks.deleted_at)));

        if (used) {
            throw httpError(409, `The media type is used by ${countOf(used, 'track')}. Reassign them first.`);
        }

        const [deleted] = await tx
            .update(media_types)
            .set({ deleted_at: sql`now()` })
            .where(eq(media_types.id, id))
            .returning(columns);

        return deleted;
    });

    return c.json({ data });
});

export default mediaTypeRoutes;
