import { getTableColumns, isNull } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import omit from 'lodash-es/omit';

// Deleting a row sets deleted_at, so every read leaves those rows out and never
// returns the column. Pass `withoutDeletedAt` as a relational query's
// `columns`, `columnsWithoutDeletedAt(table)` to `.returning()` (a write
// returns the row as a read does), and `notDeleted(table)` as a `where`.
export const withoutDeletedAt = { deleted_at: false } as const;

export const notDeleted = (table: { deleted_at: AnyPgColumn }) => isNull(table.deleted_at);

export const columnsWithoutDeletedAt = <T extends PgTable & { deleted_at: AnyPgColumn }>(table: T) =>
    omit(getTableColumns(table), 'deleted_at');
