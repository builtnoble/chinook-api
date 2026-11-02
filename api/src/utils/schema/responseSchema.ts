import z from 'zod';
import { snakeCaseSchema } from '@/utils/helpers';

export const unauthorizedSchema = z.object({
    message: z.literal('Unauthorized'),
});

// Returned when the query string or path parameters fail validation.
export const validationErrorSchema = z
    .object({
        success: z.literal(false),
        data: z.record(z.string(), z.unknown()).describe('The input that failed validation.'),
        error: z
            .array(
                z.object({
                    code: z.string().describe('Machine-readable issue code.'),
                    message: z.string().describe('Human-readable explanation.'),
                    path: z.array(z.union([z.string(), z.number()])).describe('Path to the invalid parameter.'),
                }),
            )
            .describe('The validation issues found.'),
    })
    .meta({
        examples: [
            {
                success: false,
                data: { id: 'abc' },
                error: [
                    {
                        code: 'invalid_type',
                        message: 'Invalid input: expected number, received NaN',
                        path: ['id'],
                    },
                ],
            },
        ],
    });

// Returned when the requested page or limit is outside the available range.
export const paginationErrorSchema = z
    .object({
        error: z.string(),
    })
    .meta({
        examples: [{ error: 'Page cannot exceed 35.' }],
    });

// Returned when no item has the requested id, or the item has been deleted.
export const notFoundSchema = z
    .object({
        error: z.string(),
    })
    .meta({ examples: [{ error: 'Artist not found.' }] });

// Returned when a write has a body that is not valid JSON. A body that is JSON
// but invalid gets validationErrorSchema.
export const malformedJsonSchema = z
    .object({
        error: z.string(),
    })
    .meta({ examples: [{ error: 'Malformed JSON in request body' }] });

// Returned when the caller is signed in but may not write: not an admin, or a
// cookie write from an unlisted origin.
export const forbiddenSchema = z
    .object({
        error: z.string(),
    })
    .meta({ examples: [{ error: 'This action requires the admin role.' }] });

// Returned when a write collides with existing data, or a delete is blocked by
// rows that still depend on the item.
export const conflictSchema = z
    .object({
        error: z.string(),
    })
    .meta({ examples: [{ error: 'A row with that value already exists.' }] });

// Returned when a write refers to a parent that does not exist or is deleted,
// or a value is too long for its column.
export const unprocessableSchema = z
    .object({
        error: z.string(),
    })
    .meta({ examples: [{ error: 'The row refers to a parent that does not exist.' }] });

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
