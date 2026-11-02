import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { playlists } from '@/db/chinookSchema';
import { updateSchema } from '@/utils/schema/requestSchema';

export const playlistSchema = createSelectSchema(playlists, {
    id: (schema) => schema.describe('Unique identifier for the playlist.'),
    name: (schema) => schema.describe('Name of the playlist.'),
}).meta({ examples: [{ id: 1, name: 'Music' }] });

export const playlistCreateSchema = createInsertSchema(playlists, {
    name: (schema) => schema.min(1).describe('Name of the playlist.'),
})
    .omit({ id: true })
    .strict();
export const playlistUpdateSchema = updateSchema(playlistCreateSchema);
