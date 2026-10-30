import { getTableColumns, isNull } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Context as GenericContext } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Bindings } from 'hono/types';
import type { ZodType, z } from 'zod';
import db from '@/db';
import { getPageUrls } from '@/utils/helpers';
import type { querySchema } from '@/utils/schema';

type QuerySchema<T extends ZodType> = {
    out: {
        query: z.infer<T>;
    };
    in: {
        query: z.input<T>;
    };
};

type PaginationVariables = {
    currentPage: number;
    perPage: number;
    offset: number;
    totalItems: number;
    totalPages: number;
    prevPageUrl: string | null;
    nextPageUrl: string | null;
};

type Context = GenericContext<
    { Bindings: Bindings; Variables: { pagination: PaginationVariables } },
    string,
    QuerySchema<typeof querySchema>
>;

// Deleting a row sets deleted_at, so by default the count leaves those rows out
// to match what the route lists. Tables without a deleted_at column are counted
// in full; pass `false` to count every row.
const paginationMiddleware = (table: PgTable, excludeDeleted = true) => {
    const { deleted_at } = getTableColumns(table);
    const where = excludeDeleted && deleted_at ? isNull(deleted_at) : undefined;

    return createMiddleware<{ Bindings: Bindings; Variables: { pagination: PaginationVariables } }>(
        async (c: Context, next) => {
            const totalItems = await db.$count(table, where);

            const validated = c.req.valid('query');
            const currentPage = validated.page || 1;
            const perPage = validated.limit || Math.min(totalItems, 10);

            const offset = (currentPage - 1) * perPage;

            const totalPages = Math.ceil(totalItems / perPage);

            if (currentPage > totalPages) {
                return c.json({ error: `Page cannot exceed ${totalPages}.` }, 400);
            }

            if (perPage > totalItems) {
                return c.json({ error: `Limit cannot exceed ${totalItems}.` }, 400);
            }

            const { prevPageUrl, nextPageUrl } = getPageUrls(c.req.path, currentPage, totalPages);

            c.set('pagination', { currentPage, perPage, offset, totalItems, totalPages, prevPageUrl, nextPageUrl });

            await next();
        },
    );
};

export default paginationMiddleware;
