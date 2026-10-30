import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import z from 'zod';
import { albums, artists, genres, media_types, playlist_tracks, playlists, tracks } from '@/db/schema';
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
                    {
                        code: 'invalid_type',
                        message: 'Invalid input: expected number, received NaN',
                        path: ['id'],
                    },
                ],
            },
        ],
    });

// Returned when the requested page or limit is outside the available range.
export const paginationErrorSchema = z
    .object({
        error: z.string(),
    })
    .meta({
        examples: [{ error: 'Page cannot exceed 35.' }],
    });

// Returned when no item has the requested id, or the item has been deleted.
export const notFoundSchema = z
    .object({
        error: z.string(),
    })
    .meta({ examples: [{ error: 'Artist not found.' }] });

// Returned when a write has a body that is not valid JSON. A body that is JSON but invalid gets validationErrorSchema.
export const malformedJsonSchema = z
    .object({
        error: z.string(),
    })
    .meta({ examples: [{ error: 'Malformed JSON in request body' }] });

// Returned when the caller is signed in but may not write: not an admin, or a cookie write from an unlisted origin.
export const forbiddenSchema = z
    .object({
        error: z.string(),
    })
    .meta({ examples: [{ error: 'This action requires the admin role.' }] });

// Returned when a write collides with existing data, or a delete is blocked by rows that still depend on the item.
export const conflictSchema = z
    .object({
        error: z.string(),
    })
    .meta({ examples: [{ error: 'A row with that value already exists.' }] });

// Returned when a write refers to a parent that does not exist or is deleted, or a value is too long for its column.
export const unprocessableSchema = z
    .object({
        error: z.string(),
    })
    .meta({ examples: [{ error: 'The row refers to a parent that does not exist.' }] });

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
})
    .omit({ deleted_at: true })
    .meta({ examples: [artistExample] });

export const albumSchema = createSelectSchema(albums, {
    id: (schema) => schema.describe('Unique identifier for the album.'),
    title: (schema) => schema.describe('Title of the album.'),
    artist_id: (schema) => schema.describe('Identifier of the album artist.'),
})
    .omit({ deleted_at: true })
    .extend({
        artist: artistSchema.describe('The artist who made the album.'),
    })
    .meta({ examples: [albumExample] });

export const genreSchema = createSelectSchema(genres, {
    id: (schema) => schema.describe('Unique identifier for the genre.'),
    name: (schema) => schema.describe('Name of the genre.'),
})
    .omit({ deleted_at: true })
    .meta({ examples: [genreExample] });

export const mediaTypeSchema = createSelectSchema(media_types, {
    id: (schema) => schema.describe('Unique identifier for the media type.'),
    name: (schema) => schema.describe('Name of the media type.'),
})
    .omit({ deleted_at: true })
    .meta({ examples: [mediaTypeExample] });

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
    .omit({ deleted_at: true })
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

// The body of an update: any of the fields of a create, but at least one, and none the table does not have.
const updateSchema = <T extends z.ZodObject>(create: T) =>
    create
        .partial()
        .strict()
        .refine((body) => Object.keys(body).length > 0, 'At least one field is required.');

export const cascadeQuerySchema = z.object({
    cascade: z
        .enum(['true', 'false'])
        .optional()
        .describe('Set to `true` to delete what depends on the item too. Defaults to `false`.'),
});

// A write sets the same columns a read returns, so a create leaves out the id and the soft-delete column.
export const artistCreateSchema = createInsertSchema(artists, {
    name: (schema) => schema.min(1).describe('Name of the artist.'),
})
    .omit({ id: true, deleted_at: true })
    .strict();
export const artistUpdateSchema = updateSchema(artistCreateSchema);

export const albumCreateSchema = createInsertSchema(albums, {
    title: (schema) => schema.min(1).describe('Title of the album.'),
    artist_id: (schema) => schema.describe('Identifier of the album artist, who must exist.'),
})
    .omit({ id: true, deleted_at: true })
    .strict();
export const albumUpdateSchema = updateSchema(albumCreateSchema);

export const genreCreateSchema = createInsertSchema(genres, {
    name: (schema) => schema.min(1).describe('Name of the genre.'),
})
    .omit({ id: true, deleted_at: true })
    .strict();
export const genreUpdateSchema = updateSchema(genreCreateSchema);

export const mediaTypeCreateSchema = createInsertSchema(media_types, {
    name: (schema) => schema.min(1).describe('Name of the media type.'),
})
    .omit({ id: true, deleted_at: true })
    .strict();
export const mediaTypeUpdateSchema = updateSchema(mediaTypeCreateSchema);

export const playlistCreateSchema = createInsertSchema(playlists, {
    name: (schema) => schema.min(1).describe('Name of the playlist.'),
})
    .omit({ id: true })
    .strict();
export const playlistUpdateSchema = updateSchema(playlistCreateSchema);

export const trackCreateSchema = createInsertSchema(tracks, {
    name: (schema) => schema.min(1).describe('Name of the track.'),
    album_id: (schema) => schema.describe('Identifier of the album the track appears on, which must exist.'),
    media_type_id: (schema) =>
        schema.describe('Identifier of the media type the track is encoded as, which must exist.'),
    genre_id: (schema) => schema.describe('Identifier of the genre of the track, which must exist.'),
    composer: (schema) => schema.describe('Composers of the track.'),
    milliseconds: (schema) => schema.positive().describe('Length of the track in milliseconds.'),
    bytes: (schema) => schema.nonnegative().describe('Size of the track file in bytes.'),
    unit_price: (schema) =>
        schema
            .regex(/^\d{1,8}(\.\d{1,2})?$/, 'Must be a decimal with at most two places, for example "0.99".')
            .describe('Price of the track as a decimal string, for example "0.99".'),
})
    .omit({ id: true, deleted_at: true })
    .strict();
export const trackUpdateSchema = updateSchema(trackCreateSchema);

export const playlistTrackParamSchema = z.object({
    id: z.coerce.number().describe('Unique identifier of the playlist.'),
    track_id: z.coerce.number().describe('Unique identifier of the track.'),
});

export const playlistTrackSchema = createSelectSchema(playlist_tracks, {
    playlist_id: (schema) => schema.describe('Identifier of the playlist.'),
    track_id: (schema) => schema.describe('Identifier of the track.'),
}).meta({ examples: [{ playlist_id: 1, track_id: 1 }] });

export const playlistTrackCreateSchema = createInsertSchema(playlist_tracks, {
    track_id: (schema) => schema.describe('Identifier of the track to add, which must exist.'),
})
    .omit({ playlist_id: true })
    .strict();
