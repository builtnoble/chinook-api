import type { Context as GenericContext } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Bindings } from 'hono/types';
import type { z } from 'zod';
import { problem } from '@/lib/problem-details';
import { getPageUrls } from '@/utils/helpers/paginationHelper';
import type { querySchema } from '@/utils/schema/requestSchema';

type Query = z.infer<typeof querySchema>;

type QuerySchema = {
    out: {
        query: Query;
    };
    in: {
        query: z.input<typeof querySchema>;
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
    QuerySchema
>;

// Pages the rows `countItems` counts. A list route counts the rows its filters
// leave, with the same `where` it lists them with. It is given the validated
// query, which can have more than `page` and `limit`, and the context.
export const paginateBy = <Q extends Query = Query>(countItems: (query: Q, c: Context) => Promise<number>) =>
    createMiddleware<{ Bindings: Bindings; Variables: { pagination: PaginationVariables } }>(
        async (c: Context, next) => {
            const validated = c.req.valid('query') as Q;
            const totalItems = await countItems(validated, c);

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

            const { prevPageUrl, nextPageUrl } = getPageUrls(c.req.path, currentPage, totalPages, validated);

            c.set('pagination', { currentPage, perPage, offset, totalItems, totalPages, prevPageUrl, nextPageUrl });

            await next();
        },
    );
