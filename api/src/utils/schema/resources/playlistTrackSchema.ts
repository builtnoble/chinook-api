import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import z from 'zod';
import { playlist_tracks } from '@/db/chinookSchema';

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
