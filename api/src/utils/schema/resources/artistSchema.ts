import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { artists } from '@/db/schema';
import { updateSchema } from '@/utils/schema/requestSchema';

// A sample row from the Chinook database, used as a response example in the
// docs.
export const artistExample = { id: 1, name: 'AC/DC' };

export const artistSchema = createSelectSchema(artists, {
    id: (schema) => schema.describe('Unique identifier for the artist.'),
    name: (schema) => schema.describe('Name of the artist.'),
})
    .omit({ deleted_at: true })
    .meta({ examples: [artistExample] });

// A write sets the same columns a read returns, so a create leaves out the id
// and the soft-delete column.
export const artistCreateSchema = createInsertSchema(artists, {
    name: (schema) => schema.min(1).describe('Name of the artist.'),
})
    .omit({ id: true, deleted_at: true })
    .strict();
export const artistUpdateSchema = updateSchema(artistCreateSchema);
