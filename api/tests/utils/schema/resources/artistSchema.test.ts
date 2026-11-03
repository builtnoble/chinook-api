import { describe, expect, it } from 'bun:test';
import { artistCreateSchema, artistUpdateSchema } from '@/utils/schema/resources/artistSchema';

describe('artistCreateSchema', () => {
    it('accepts the fields of the table and nothing else', () => {
        expect(artistCreateSchema.safeParse({ name: 'AC/DC' }).success).toBe(true);
    });

    it.each<[string, Record<string, unknown>]>([
        ['id', { id: 5 }],
        ['deleted_at', { deleted_at: '2026-01-01T00:00:00Z' }],
        ['an unknown key', { colour: 'red' }],
    ])('rejects %s', (_, extra) => {
        expect(artistCreateSchema.safeParse({ name: 'AC/DC', ...extra }).success).toBe(false);
    });

    it('rejects an empty or missing name, and one longer than the column', () => {
        expect(artistCreateSchema.safeParse({ name: '' }).success).toBe(false);
        expect(artistCreateSchema.safeParse({}).success).toBe(false);
        expect(artistCreateSchema.safeParse({ name: 'x'.repeat(256) }).success).toBe(false);
    });
});

describe('artistUpdateSchema', () => {
    it('takes the name, and rejects an empty body, an unknown key and an id', () => {
        expect(artistUpdateSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
        expect(artistUpdateSchema.safeParse({}).success).toBe(false);
        expect(artistUpdateSchema.safeParse({ colour: 'red' }).success).toBe(false);
        expect(artistUpdateSchema.safeParse({ id: 5 }).success).toBe(false);
    });
});
