import { createSelectSchema } from 'drizzle-zod';
import z from 'zod';
import { albums, artists, genres, media_types, playlists, tracks } from '@/db/schema';
import { snakeCaseSchema } from '@/utils/helpers';

export const querySchema = z.object({
    limit: z.coerce.number().optional().describe('Number of items per page. Defaults to 10, or the total if fewer.'),
    page: z.coerce.number().optional().describe('Page number to return, starting at 1. Defaults to 1.'),
});

export const paramSchema = z.object({
    id: z.coerce.number().describe('Unique identifier of the item.'),
});

export const unauthorizedSchema = z.object({
    message: z.literal('Unauthorized'),
});

// Returned when the query string or path parameters fail validation.
export const validationErrorSchema = z
    .object({
        success: z.literal(false),
        data: z.record(z.string(), z.unknown()).describe('The input that failed validation.'),
        error: z
            .array(
                z.object({
                    code: z.string().describe('Machine-readable issue code.'),
                    message: z.string().describe('Human-readable explanation.'),
                    path: z.array(z.union([z.string(), z.number()])).describe('Path to the invalid parameter.'),
                }),
            )
            .describe('The validation issues found.'),
    })
    .meta({
        examples: [
            {
                success: false,
                data: { id: 'abc' },
                error: [
                    { code: 'invalid_type', message: 'Invalid input: expected number, received NaN', path: ['id'] },
                ],
            },
        ],
    });

// Returned when the requested page or limit is outside the available range.
export const paginationErrorSchema = z
    .object({
        error: z.string(),
    })
    .meta({ examples: [{ error: 'Page cannot exceed 35.' }] });

export const paginationSchema = snakeCaseSchema(
    z.object({
        currentPage: z.number().describe('The page returned.'),
        perPage: z.number().describe('Number of items per page.'),
        totalItems: z.number().describe('Total number of items across all pages.'),
        totalPages: z.number().describe('Total number of pages.'),
        prevPageUrl: z.string().nullable().describe('Path of the previous page, or null on the first page.'),
        nextPageUrl: z.string().nullable().describe('Path of the next page, or null on the last page.'),
    }),
).describe('Where the returned page sits among all pages.');

// Sample rows from the Chinook database, used as response examples in the docs.
const artistExample = { id: 1, name: 'AC/DC' };
const albumExample = { id: 1, title: 'For Those About To Rock We Salute You', artist_id: 1, artist: artistExample };
const genreExample = { id: 1, name: 'Rock' };
const mediaTypeExample = { id: 1, name: 'MPEG audio file' };

export const artistSchema = createSelectSchema(artists, {
    id: (schema) => schema.describe('Unique identifier for the artist.'),
    name: (schema) => schema.describe('Name of the artist.'),
}).meta({ examples: [artistExample] });

export const albumSchema = createSelectSchema(albums, {
    id: (schema) => schema.describe('Unique identifier for the album.'),
    title: (schema) => schema.describe('Title of the album.'),
    artist_id: (schema) => schema.describe('Identifier of the album artist.'),
})
    .extend({
        artist: artistSchema.describe('The artist who made the album.'),
    })
    .meta({ examples: [albumExample] });

export const genreSchema = createSelectSchema(genres, {
    id: (schema) => schema.describe('Unique identifier for the genre.'),
    name: (schema) => schema.describe('Name of the genre.'),
}).meta({ examples: [genreExample] });

export const mediaTypeSchema = createSelectSchema(media_types, {
    id: (schema) => schema.describe('Unique identifier for the media type.'),
    name: (schema) => schema.describe('Name of the media type.'),
}).meta({ examples: [mediaTypeExample] });

export const playlistSchema = createSelectSchema(playlists, {
    id: (schema) => schema.describe('Unique identifier for the playlist.'),
    name: (schema) => schema.describe('Name of the playlist.'),
}).meta({ examples: [{ id: 1, name: 'Music' }] });

export const trackSchema = createSelectSchema(tracks, {
    id: (schema) => schema.describe('Unique identifier for the track.'),
    name: (schema) => schema.describe('Name of the track.'),
    album_id: (schema) => schema.describe('Identifier of the album the track appears on.'),
    media_type_id: (schema) => schema.describe('Identifier of the media type the track is encoded as.'),
    genre_id: (schema) => schema.describe('Identifier of the genre of the track.'),
    composer: (schema) => schema.describe('Composers of the track.'),
    milliseconds: (schema) => schema.describe('Length of the track in milliseconds.'),
    bytes: (schema) => schema.describe('Size of the track file in bytes.'),
    unit_price: (schema) => schema.describe('Price of the track as a decimal string, for example "0.99".'),
})
    .extend({
        album: albumSchema.nullable().describe('The album the track appears on, if any.'),
        genre: genreSchema.nullable().describe('The genre of the track, if any.'),
        media_type: mediaTypeSchema.describe('The media type the track is encoded as.'),
    })
    .meta({
        examples: [
            {
                id: 1,
                name: 'For Those About To Rock (We Salute You)',
                album_id: 1,
                media_type_id: 1,
                genre_id: 1,
                composer: 'Angus Young, Malcolm Young, Brian Johnson',
                milliseconds: 343719,
                bytes: 11170334,
                unit_price: '0.99',
                album: albumExample,
                genre: genreExample,
                media_type: mediaTypeExample,
            },
        ],
    });
