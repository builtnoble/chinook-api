import { describe, expect, it } from 'bun:test';
import z from 'zod';
import { albumQuerySchema, artistQuerySchema, trackQuerySchema, updateSchema } from '@/utils/schema/requestSchema';

const schema = updateSchema(z.object({ name: z.string().min(1), size: z.number() }));

describe('updateSchema', () => {
    it('takes any one field of the create schema', () => {
        expect(schema.safeParse({ name: 'Renamed' }).success).toBe(true);
        expect(schema.safeParse({ size: 2 }).success).toBe(true);
    });

    it('rejects an empty body, which would update nothing', () => {
        const result = schema.safeParse({});

        expect(result.success).toBe(false);
        expect(JSON.stringify(result.error?.issues)).toContain('At least one field is required.');
    });

    it('still rejects an unknown key and a value that is not valid', () => {
        expect(schema.safeParse({ colour: 'red' }).success).toBe(false);
        expect(schema.safeParse({ name: '' }).success).toBe(false);
    });
});

describe('the search', () => {
    const parse = (query: Record<string, unknown>) => trackQuerySchema.safeParse(query);
    const issueCodes = (query: Record<string, unknown>) => {
        const result = parse(query);

        return result.success ? [] : result.error.issues.map((issue) => [issue.path.join('.'), issue.code]);
    };

    it('trims q, and an empty or blank one is not an error', () => {
        expect(parse({ q: '  queen  ' }).data?.q).toBe('queen');
        expect(parse({ q: '' }).success).toBe(true);
        expect(parse({ q: '   ' }).data?.q).toBe('');
        expect(parse({}).data?.q).toBeUndefined();
    });

    it('takes 100 characters after trimming and no more', () => {
        expect(parse({ q: ` ${'a'.repeat(100)} ` }).success).toBe(true);
        expect(issueCodes({ q: 'a'.repeat(101) })).toEqual([['q', 'too_big']]);
    });

    it('takes five terms and no more', () => {
        expect(parse({ q: 'a b c d e' }).success).toBe(true);
        expect(parse({ q: ' a  b   c d e ' }).success).toBe(true);
        expect(issueCodes({ q: 'a b c d e f' })).toEqual([['q', 'custom']]);
    });

    it('is on every list schema, saying which fields it searches', () => {
        for (const schema of [artistQuerySchema, albumQuerySchema, trackQuerySchema]) {
            expect(schema.shape.q.description).toContain('every term must be found');
        }

        expect(albumQuerySchema.shape.q.description).toContain('`title`');
        expect(trackQuerySchema.shape.q.description).toContain('album `title`');
    });
});

describe('the id filters', () => {
    const parse = (query: Record<string, unknown>) => trackQuerySchema.safeParse(query);

    it('takes a positive whole number, from the query string', () => {
        expect(parse({ album_id: '2', genre_id: '3', media_type_id: '1' }).data).toMatchObject({
            album_id: 2,
            genre_id: 3,
            media_type_id: 1,
        });
        expect(albumQuerySchema.safeParse({ artist_id: '4' }).data?.artist_id).toBe(4);
    });

    it.each(['abc', '0', '-1', '1.5', '', 'NaN'])('rejects %p', (value) => {
        for (const field of ['album_id', 'genre_id', 'media_type_id']) {
            expect(parse({ [field]: value }).success).toBe(false);
        }
    });

    it('is optional', () => {
        expect(parse({}).success).toBe(true);
    });

    it('ignores a parameter it does not know', () => {
        expect(parse({ sort: 'name', page: '2' }).success).toBe(true);
    });
});
