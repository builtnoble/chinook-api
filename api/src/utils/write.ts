import { and, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type db from '@/db';
import type { albums, artists, genres, media_types, tracks } from '@/db/schema';

// What `db.transaction` hands its callback.
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// An error the error handler returns as `{ error }` with this status.
export const httpError = (status: 400 | 404 | 409 | 422, message: string) => new HTTPException(status, { message });

type SoftDeleted = typeof artists | typeof albums | typeof genres | typeof media_types | typeof tracks;

// A foreign key accepts a soft-deleted row, so a write that points at a parent checks that it is live. The row is
// share-locked until the transaction ends: deleting a parent takes a conflicting lock first, so the delete waits for
// this write and then sees the child it adds, instead of the child landing under a parent deleted in between.
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
        throw httpError(422, `${field} does not refer to an existing ${label}.`);
    }
};
