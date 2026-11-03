import { and, eq, getTableColumns, isNull } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import omit from 'lodash-es/omit';
import type { Transaction } from '@/db';
import type { albums, artists, genres, media_types, tracks } from '@/db/chinookSchema';
import { problem } from '@/lib/problem-details';

// Deleting a row sets deleted_at, so every read leaves those rows out and never
// returns the column. Pass `withoutDeletedAt` as a relational query's
// `columns`, `columnsWithoutDeletedAt(table)` to `.returning()` (a write
// returns the row as a read does), and `notDeleted(table)` as a `where`.
export const withoutDeletedAt = { deleted_at: false } as const;

export const notDeleted = (table: { deleted_at: AnyPgColumn }) => isNull(table.deleted_at);

export const columnsWithoutDeletedAt = <T extends PgTable & { deleted_at: AnyPgColumn }>(table: T) =>
    omit(getTableColumns(table), 'deleted_at');

type SoftDeleted = typeof artists | typeof albums | typeof genres | typeof media_types | typeof tracks;

// A foreign key accepts a soft-deleted row, so a write that points at a parent
// checks that it is live. The row is share-locked until the transaction ends:
// deleting a parent takes a conflicting lock first, so the delete waits for
// this write and then sees the child it adds, instead of the child landing
// under a parent deleted in between.
export const requireLiveParent = async (
    tx: Transaction,
    table: SoftDeleted,
    id: number,
    field: string,
    label: string,
): Promise<void> => {
    const [row] = await tx
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.id, id), isNull(table.deleted_at)))
        .for('share');

    if (!row) {
        throw problem(422, `${field} does not refer to an existing ${label}.`, { code: 'invalid_reference' });
    }
};
