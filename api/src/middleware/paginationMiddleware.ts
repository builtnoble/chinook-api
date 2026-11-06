import { getTableColumns, isNull } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Context as GenericContext } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Bindings } from 'hono/types';
import type { ZodType, z } from 'zod';
import db from '@/db';
import { problem } from '@/lib/problem-details';
import { getPageUrls } from '@/utils/helpers/paginationHelper';
import type { querySchema } from '@/utils/schema/requestSchema';

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

// Pages the rows `countItems` counts, which a route that lists only some of a
// table's rows uses to count just those.
export const paginateBy = (countItems: (c: Context) => Promise<number>) =>
    createMiddleware<{ Bindings: Bindings; Variables: { pagination: PaginationVariables } }>(
        async (c: Context, next) => {
            const totalItems = await countItems(c);

            const validated = c.req.valid('query');
            const currentPage = validated.page || 1;
            const perPage = validated.limit || Math.min(totalItems, 10);

            const offset = (currentPage - 1) * perPage;

            // With no rows there is one empty page, so the first page is not
            // out of range.
            const totalPages = perPage ? Math.ceil(totalItems / perPage) : 0;
            const lastPage = Math.max(totalPages, 1);

            if (currentPage > lastPage) {
                throw problem(400, `Page cannot exceed ${lastPage}.`, { code: 'page_out_of_range' });
            }

            if (perPage > totalItems) {
                throw problem(400, `Limit cannot exceed ${totalItems}.`, { code: 'limit_out_of_range' });
            }

            const { prevPageUrl, nextPageUrl } = getPageUrls(c.req.path, currentPage, totalPages);

            c.set('pagination', { currentPage, perPage, offset, totalItems, totalPages, prevPageUrl, nextPageUrl });

            await next();
        },
    );

// Deleting a row sets deleted_at, so by default the count leaves those rows out
// to match what the route lists. Tables without a deleted_at column are counted
// in full; pass `false` to count every row.
const paginationMiddleware = (table: PgTable, excludeDeleted = true) => {
    const { deleted_at } = getTableColumns(table);
    const where = excludeDeleted && deleted_at ? isNull(deleted_at) : undefined;

    return paginateBy(() => db.$count(table, where));
};

export default paginationMiddleware;
