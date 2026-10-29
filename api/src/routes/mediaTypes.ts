import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { media_types } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeList } from '@/utils/openapi';
import { mediaTypeSchema, paramSchema, querySchema } from '@/utils/schema';

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
    validator('query', querySchema),
    paginationMiddleware(media_types),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const mediaTypes = await db.query.media_types.findMany({
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
    description: 'Returns the media type with the given id. An unknown id returns 200 with no `data`.',
    schema: mediaTypeSchema,
});

mediaTypeRoutes.get('/:id', describeRoute(getMediaTypeByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.media_types.findFirst({
        where: eq(media_types.id, id),
    });

    return c.json({ data });
});

export default mediaTypeRoutes;
