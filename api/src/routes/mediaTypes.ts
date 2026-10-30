import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { media_types } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeList } from '@/utils/openapi';
import { mediaTypeSchema, paramSchema, querySchema } from '@/utils/schema';

const mediaTypeRoutes = new Hono();

// Deleting a media type sets deleted_at, so every read leaves those rows out and never returns the column.
const notDeleted = isNull(media_types.deleted_at);
const withoutDeletedAt = { deleted_at: false } as const;

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

export default mediaTypeRoutes;
