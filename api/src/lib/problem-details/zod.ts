import z from 'zod';

// Zod schemas that describe the responses of this library, for an OpenAPI document. They are a separate entry point
// so that the rest of the library does not need Zod.

export const fieldErrorSchema = z.object({
    field: z.string().describe('A JSON Pointer to the offending value, relative to the part of the request in `in`.'),
    in: z
        .enum(['body', 'path', 'query', 'header', 'cookie'])
        .optional()
        .describe('The part of the request `field` is in.'),
    message: z.string().describe('What is wrong with the value.'),
    code: z.string().optional().describe('The validator code for the issue, such as `invalid_type`.'),
});

export const problemDetailsSchema = z
    .looseObject({
        type: z
            .string()
            .describe(
                'A URI reference naming the kind of problem. `about:blank` when it has no more meaning than the status.',
            ),
        title: z.string().describe('A short summary of the kind of problem, the same for every occurrence.'),
        status: z.number().int().describe('The HTTP status of the response.'),
        detail: z.string().optional().describe('An explanation of this occurrence of the problem.'),
        instance: z.string().optional().describe('A URI reference for this occurrence of the problem.'),
        code: z.string().optional().describe('A stable, machine-readable name for the problem, such as `not_found`.'),
    })
    .describe('A problem document (RFC 9457).');

export const validationProblemSchema = problemDetailsSchema
    .extend({ errors: z.array(fieldErrorSchema).describe('Every issue found with the request.') })
    .describe('A problem document for a request that failed validation.');
