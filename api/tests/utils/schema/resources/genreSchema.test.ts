import { describe, expect, it } from 'bun:test';
import { genreCreateSchema } from '@/utils/schema/resources/genreSchema';

describe('genreCreateSchema', () => {
    it('accepts a name, and rejects an empty one', () => {
        expect(genreCreateSchema.safeParse({ name: 'Rock' }).success).toBe(true);
        expect(genreCreateSchema.safeParse({ name: '' }).success).toBe(false);
    });
});
