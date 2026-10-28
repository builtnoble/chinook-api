import { createSelectSchema } from 'drizzle-zod';
import z from 'zod';
import { albums, artists, genres, media_types, playlists, tracks } from '@/db/schema';
import { snakeCaseSchema } from '@/utils/helpers';

export const querySchema = z.object({
    limit: z.coerce.number().optional(),
    page: z.coerce.number().optional(),
});

export const paramSchema = z.object({
    id: z.coerce.number(),
});

export const paginationSchema = snakeCaseSchema(
    z.object({
        currentPage: z.number(),
        perPage: z.number(),
        totalItems: z.number(),
        totalPages: z.number(),
        prevPageUrl: z.string().nullable(),
        nextPageUrl: z.string().nullable(),
    }),
);

export const artistSchema = createSelectSchema(artists);

export const albumSchema = createSelectSchema(albums).extend({
    artist: artistSchema,
});

export const genreSchema = createSelectSchema(genres);
export const mediaTypeSchema = createSelectSchema(media_types);
export const playlistSchema = createSelectSchema(playlists);

export const trackSchema = createSelectSchema(tracks).extend({
    album: albumSchema,
    genre: genreSchema,
    media_type: mediaTypeSchema,
});
