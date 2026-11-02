import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { albums } from '@/db/chinookSchema';
import { updateSchema } from '@/utils/schema/requestSchema';
import { artistExample, artistSchema } from '@/utils/schema/resources/artistSchema';

export const albumExample = {
    id: 1,
    title: 'For Those About To Rock We Salute You',
    artist_id: 1,
    artist: artistExample,
};

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

export const albumCreateSchema = createInsertSchema(albums, {
    title: (schema) => schema.min(1).describe('Title of the album.'),
    artist_id: (schema) => schema.describe('Identifier of the album artist, who must exist.'),
})
    .omit({ id: true, deleted_at: true })
    .strict();
export const albumUpdateSchema = updateSchema(albumCreateSchema);
