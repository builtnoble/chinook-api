import { and, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import db from '@/db';
import { media_types, tracks } from '@/db/chinookSchema';
import { problem } from '@/lib/problem-details';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { countOf } from '@/utils/helpers/countHelper';
import { validate } from '@/utils/helpers/requestValidationHelper';
import { columnsWithoutDeletedAt, notDeleted, withoutDeletedAt } from '@/utils/helpers/softDeleteHelper';
import { describeByID, describeCreate, describeDelete, describeList, describeUpdate } from '@/utils/openapi';
import { paramSchema, querySchema } from '@/utils/schema/requestSchema';
import {
    mediaTypeCreateSchema,
    mediaTypeSchema,
    mediaTypeUpdateSchema,
} from '@/utils/schema/resources/mediaTypeSchema';

const mediaTypeRoutes = new Hono();

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
    validate('query', querySchema),
    paginationMiddleware(media_types),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const rows = await db.query.media_types.findMany({
            columns: withoutDeletedAt,
            where: notDeleted(media_types),
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: rows,
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

mediaTypeRoutes.get('/:id', describeRoute(getMediaTypeByID), validate('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.media_types.findFirst({
        columns: withoutDeletedAt,
        where: and(eq(media_types.id, id), notDeleted(media_types)),
    });

    if (!data) {
        throw problem(404, 'Media type not found.');
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

mediaTypeRoutes.post('/', describeRoute(createMediaType), validate('json', mediaTypeCreateSchema), async (c) => {
    const [data] = await db
        .insert(media_types)
        .values(c.req.valid('json'))
        .returning(columnsWithoutDeletedAt(media_types));

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
    validate('param', paramSchema),
    validate('json', mediaTypeUpdateSchema),
    async (c) => {
        const { id } = c.req.valid('param');

        const [data] = await db
            .update(media_types)
            .set(c.req.valid('json'))
            .where(and(eq(media_types.id, id), notDeleted(media_types)))
            .returning(columnsWithoutDeletedAt(media_types));

        if (!data) {
            throw problem(404, 'Media type not found.');
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
    blockedExample: 'The media type is used by 3 tracks. Reassign them first.',
});

mediaTypeRoutes.delete('/:id', describeRoute(deleteMediaType), validate('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.transaction(async (tx) => {
        // Locked first, so a track that is being added to the media type
        // finishes before the tracks are counted.
        const [mediaType] = await tx
            .select({ id: media_types.id })
            .from(media_types)
            .where(and(eq(media_types.id, id), notDeleted(media_types)))
            .for('update');

        if (!mediaType) {
            throw problem(404, 'Media type not found.');
        }

        const used = await tx.$count(tracks, and(eq(tracks.media_type_id, id), isNull(tracks.deleted_at)));

        if (used) {
            throw problem(409, `The media type is used by ${countOf(used, 'track')}. Reassign them first.`, {
                code: 'delete_blocked',
            });
        }

        const [deleted] = await tx
            .update(media_types)
            .set({ deleted_at: sql`now()` })
            .where(eq(media_types.id, id))
            .returning(columnsWithoutDeletedAt(media_types));

        return deleted;
    });

    return c.json({ data });
});

export default mediaTypeRoutes;
