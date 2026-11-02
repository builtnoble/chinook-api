import { describe, expect, it } from 'bun:test';
import { playlistCreateSchema } from '@/utils/schema/resources/playlistSchema';

describe('playlistCreateSchema', () => {
    it('accepts a name, and rejects an empty one', () => {
        expect(playlistCreateSchema.safeParse({ name: 'Music' }).success).toBe(true);
        expect(playlistCreateSchema.safeParse({ name: '' }).success).toBe(false);
    });
});
