import { describe, expect, it } from 'bun:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { artists, media_types, tracks } from '@/db/schema';
import { columnsWithoutDeletedAt, notDeleted, withoutDeletedAt } from '@/utils/softDelete';

const dialect = new PgDialect();

describe('notDeleted', () => {
    it.each([
        ['artists', artists],
        ['media_types', media_types],
    ])('filters %s on its own deleted_at column', (name, table) => {
        expect(dialect.sqlToQuery(notDeleted(table)).sql).toBe(`"${name}"."deleted_at" is null`);
    });
});

describe('withoutDeletedAt', () => {
    it('leaves out the deleted_at column and nothing else', () => {
        expect(withoutDeletedAt).toEqual({ deleted_at: false });
    });
});

describe('columnsWithoutDeletedAt', () => {
    it('keeps every column of the table except deleted_at', () => {
        expect(Object.keys(columnsWithoutDeletedAt(artists))).toEqual(['id', 'name']);
        expect(Object.keys(columnsWithoutDeletedAt(tracks))).not.toContain('deleted_at');
        expect(Object.keys(columnsWithoutDeletedAt(tracks))).toContain('unit_price');
    });
});
