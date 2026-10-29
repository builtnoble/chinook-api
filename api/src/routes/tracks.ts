import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import db from '@/db';
import { tracks } from '@/db/schema';
import paginationMiddleware from '@/middleware/paginationMiddleware';
import { describeByID, describeList } from '@/utils/openapi';
import { paramSchema, querySchema, trackSchema } from '@/utils/schema';

const trackRoutes = new Hono();

const getTracks = describeList({
    operationId: 'getTracks',
    tag: 'Tracks',
    summary: 'List all tracks',
    description:
        'Returns a paginated list of tracks. Each track includes its album (with the album artist), genre and media type, ordered by id.',
    schema: trackSchema,
});

trackRoutes.get(
    '/',
    describeRoute(getTracks),
    validator('query', querySchema),
    paginationMiddleware(tracks),
    async (c) => {
        const { offset, ...pagination } = c.get('pagination');

        const tracks = await db.query.tracks.findMany({
            orderBy: (albums, { asc }) => asc(albums.id),
            with: {
                album: {
                    with: {
                        artist: true,
                    },
                },
                genre: true,
                media_type: true,
            },
            limit: pagination.perPage,
            offset,
        });

        return c.json({
            data: tracks,
            pagination,
        });
    },
);

const getTrackByID = describeByID({
    operationId: 'getTrackByID',
    tag: 'Tracks',
    summary: 'Retrieve a track',
    description:
        'Returns the track with the given id. The track includes its album (with the album artist), genre and media type. An unknown id returns 200 with no `data`.',
    schema: trackSchema,
});

trackRoutes.get('/:id', describeRoute(getTrackByID), validator('param', paramSchema), async (c) => {
    const { id } = c.req.valid('param');

    const data = await db.query.tracks.findFirst({
        where: eq(tracks.id, id),
        with: {
            album: {
                with: {
                    artist: true,
                },
            },
            genre: true,
            media_type: true,
        },
    });

    return c.json({ data });
});

export default trackRoutes;
