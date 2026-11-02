import { describe, expect, it } from 'bun:test';
import { albumCreateSchema, albumUpdateSchema } from '@/utils/schema/resources/albumSchema';

describe('albumCreateSchema', () => {
    it('accepts the fields of the table', () => {
        expect(albumCreateSchema.safeParse({ title: 'Back in Black', artist_id: 1 }).success).toBe(true);
    });

    it('requires the parent id, as an integer', () => {
        expect(albumCreateSchema.safeParse({ title: 'Back in Black' }).success).toBe(false);
        expect(albumCreateSchema.safeParse({ title: 'Back in Black', artist_id: 1.5 }).success).toBe(false);
        expect(albumCreateSchema.safeParse({ title: 'Back in Black', artist_id: '1' }).success).toBe(false);
    });
});

describe('albumUpdateSchema', () => {
    it('takes the parent id alone', () => {
        expect(albumUpdateSchema.safeParse({ artist_id: 2 }).success).toBe(true);
    });
});
