import { afterEach, describe, expect, it } from 'bun:test';
import { type AnyPgColumn, PgDialect } from 'drizzle-orm/pg-core';
import db, { type Transaction } from '@/db';
import { artists, media_types, tracks } from '@/db/chinookSchema';
import { problem } from '@/lib/problem-details';
import {
    columnsWithoutDeletedAt,
    notDeleted,
    requireLiveParent,
    withoutDeletedAt,
} from '@/utils/helpers/softDeleteHelper';
import { stubDb } from '../../support/stubDb';

const dialect = new PgDialect();

let stub: ReturnType<typeof stubDb>;

afterEach(() => stub?.restore());

describe('notDeleted', () => {
    it.each<[string, { deleted_at: AnyPgColumn }]>([
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

describe('requireLiveParent', () => {
    it('passes when the parent exists and is not deleted, locking it against a concurrent delete', async () => {
        stub = stubDb([{ id: 7 }]);

        await db.transaction((tx) => requireLiveParent(tx, artists, 7, 'artist_id', 'artist'));

        expect(stub.methods()).toEqual(['select', 'from', 'where', 'for']);
        expect(stub.calls.at(-1)).toEqual(['for', ['share']]);
    });

    it('answers 422, naming the field, when no live row matches', async () => {
        stub = stubDb([]);

        const error = await db
            .transaction((tx: Transaction) => requireLiveParent(tx, artists, 7, 'artist_id', 'artist'))
            .catch((caught) => caught);

        expect(error.status).toBe(422);
        expect(error.toProblemDetails()).toEqual(
            problem(422, 'artist_id does not refer to an existing artist.', {
                code: 'invalid_reference',
            }).toProblemDetails(),
        );
    });
});
