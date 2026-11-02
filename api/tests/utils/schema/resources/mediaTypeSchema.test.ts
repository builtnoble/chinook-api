import { describe, expect, it } from 'bun:test';
import { mediaTypeCreateSchema } from '@/utils/schema/resources/mediaTypeSchema';

describe('mediaTypeCreateSchema', () => {
    it('accepts a name, and rejects an empty one', () => {
        expect(mediaTypeCreateSchema.safeParse({ name: 'MPEG audio file' }).success).toBe(true);
        expect(mediaTypeCreateSchema.safeParse({ name: '' }).success).toBe(false);
    });
});
