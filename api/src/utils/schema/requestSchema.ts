import z from 'zod';
import { snakeCaseSchema } from '@/utils/helpers/snakeCaseHelper';

export const querySchema = z.object({
    limit: z.coerce.number().optional().describe('Number of items per page. Defaults to 10, or the total if fewer.'),
    page: z.coerce.number().optional().describe('Page number to return, starting at 1. Defaults to 1.'),
});

export const paginationSchema = snakeCaseSchema(
    z.object({
        currentPage: z.number().describe('The page returned.'),
        perPage: z.number().describe('Number of items per page.'),
        totalItems: z.number().describe('Total number of items across all pages.'),
        totalPages: z.number().describe('Total number of pages.'),
        prevPageUrl: z.string().nullable().describe('Path of the previous page, or null on the first page.'),
        nextPageUrl: z.string().nullable().describe('Path of the next page, or null on the last page.'),
    }),
).describe('Where the returned page sits among all pages.');

export const paramSchema = z.object({
    id: z.coerce.number().describe('Unique identifier of the item.'),
});

export const cascadeQuerySchema = z.object({
    cascade: z
        .enum(['true', 'false'])
        .optional()
        .describe('Set to `true` to delete what depends on the item too. Defaults to `false`.'),
});

// The body of an update: any of the fields of a create, but at least one, and
// none the table does not have.
export const updateSchema = <T extends z.ZodObject>(create: T) =>
    create
        .partial()
        .strict()
        .refine((body) => Object.keys(body).length > 0, 'At least one field is required.');
