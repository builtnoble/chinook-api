import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { media_types } from '@/db/chinookSchema';
import { updateSchema } from '@/utils/schema/requestSchema';

export const mediaTypeExample = { id: 1, name: 'MPEG audio file' };

export const mediaTypeSchema = createSelectSchema(media_types, {
    id: (schema) => schema.describe('Unique identifier for the media type.'),
    name: (schema) => schema.describe('Name of the media type.'),
})
    .omit({ deleted_at: true })
    .meta({ examples: [mediaTypeExample] });

export const mediaTypeCreateSchema = createInsertSchema(media_types, {
    name: (schema) => schema.min(1).describe('Name of the media type.'),
})
    .omit({ id: true, deleted_at: true })
    .strict();
export const mediaTypeUpdateSchema = updateSchema(mediaTypeCreateSchema);
