import { describe, expect, it } from 'bun:test';
import { playlistTrackCreateSchema } from '@/utils/schema/resources/playlistTrackSchema';

describe('playlistTrackCreateSchema', () => {
    it('takes only the track id', () => {
        expect(playlistTrackCreateSchema.safeParse({ track_id: 5 }).success).toBe(true);
        expect(playlistTrackCreateSchema.safeParse({ track_id: 5, playlist_id: 1 }).success).toBe(false);
        expect(playlistTrackCreateSchema.safeParse({}).success).toBe(false);
    });
});
