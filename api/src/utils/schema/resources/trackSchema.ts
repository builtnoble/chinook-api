import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { tracks } from '@/db/chinookSchema';
import { updateSchema } from '@/utils/schema/requestSchema';
import { albumExample, albumSchema } from '@/utils/schema/resources/albumSchema';
import { genreExample, genreSchema } from '@/utils/schema/resources/genreSchema';
import { mediaTypeExample, mediaTypeSchema } from '@/utils/schema/resources/mediaTypeSchema';

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
