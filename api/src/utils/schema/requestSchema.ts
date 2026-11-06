import z from 'zod';
import { searchTerms } from '@/utils/helpers/searchHelper';
import { snakeCaseSchema } from '@/utils/helpers/snakeCaseHelper';

export const querySchema = z.object({
    limit: z.coerce.number().optional().describe('Number of items per page. Defaults to 10, or the total if fewer.'),
    page: z.coerce.number().optional().describe('Page number to return, starting at 1. Defaults to 1.'),
});

export const MAX_SEARCH_LENGTH = 100;
export const MAX_SEARCH_TERMS = 5;

// `q`, which each list route words for the fields it searches. It is trimmed,
// and an empty one is no filter, so a cleared search box can send `?q=`.
export const searchSchema = (searches: string) =>
    z.object({
        q: z
            .string()
            .trim()
            .max(MAX_SEARCH_LENGTH)
            .refine((q) => searchTerms(q).length <= MAX_SEARCH_TERMS, `At most ${MAX_SEARCH_TERMS} search terms.`)
            .optional()
            .describe(
                `Text to search for in ${searches}, up to ${MAX_SEARCH_LENGTH} characters. It is split on spaces into up to ${MAX_SEARCH_TERMS} terms, and every term must be found, in any of those fields, ignoring case. Empty means no search.`,
            )
            .meta({ examples: ['queen love'] }),
    });

const idFilter = (describes: string, example: number) =>
    z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(describes)
        .meta({ examples: [example] });

export const artistQuerySchema = querySchema.extend(searchSchema('the artist `name`').shape);

export const albumQuerySchema = querySchema.extend({
    ...searchSchema("the album `title` and the artist's `name`").shape,
    artist_id: idFilter('Only albums by the artist with this id.', 1),
});

export const genreQuerySchema = querySchema.extend(searchSchema('the genre `name`').shape);

export const mediaTypeQuerySchema = querySchema.extend(searchSchema('the media type `name`').shape);

export const playlistQuerySchema = querySchema.extend(searchSchema('the playlist `name`').shape);

export const trackQuerySchema = querySchema.extend({
    ...searchSchema("the track `name`, the album `title` and the album artist's `name`").shape,
    album_id: idFilter('Only tracks on the album with this id.', 1),
    genre_id: idFilter('Only tracks in the genre with this id.', 1),
    media_type_id: idFilter('Only tracks of the media type with this id.', 1),
});

export type ArtistQuery = z.infer<typeof artistQuerySchema>;
export type AlbumQuery = z.infer<typeof albumQuerySchema>;
export type GenreQuery = z.infer<typeof genreQuerySchema>;
export type MediaTypeQuery = z.infer<typeof mediaTypeQuerySchema>;
export type PlaylistQuery = z.infer<typeof playlistQuerySchema>;
export type TrackQuery = z.infer<typeof trackQuerySchema>;

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

export const paramSchema = z.object({
    id: z.coerce
        .number()
        .describe('Unique identifier of the item.')
        .meta({ examples: [1] }),
});

export const cascadeQuerySchema = z.object({
    cascade: z
        .enum(['true', 'false'])
        .optional()
        .describe('Set to `true` to delete what depends on the item too. Defaults to `false`.'),
});

// The body of an update: any of the fields of a create, but at least one, and
// none the table does not have.
export const updateSchema = <T extends z.ZodObject>(create: T) =>
    create
        .partial()
        .strict()
        .refine((body) => Object.keys(body).length > 0, 'At least one field is required.');
