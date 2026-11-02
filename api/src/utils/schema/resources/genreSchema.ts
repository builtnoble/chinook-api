import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { genres } from '@/db/schema';
import { updateSchema } from '@/utils/schema/requestSchema';

export const genreExample = { id: 1, name: 'Rock' };

export const genreSchema = createSelectSchema(genres, {
    id: (schema) => schema.describe('Unique identifier for the genre.'),
    name: (schema) => schema.describe('Name of the genre.'),
})
    .omit({ deleted_at: true })
    .meta({ examples: [genreExample] });

export const genreCreateSchema = createInsertSchema(genres, {
    name: (schema) => schema.min(1).describe('Name of the genre.'),
})
    .omit({ id: true, deleted_at: true })
    .strict();
export const genreUpdateSchema = updateSchema(genreCreateSchema);
