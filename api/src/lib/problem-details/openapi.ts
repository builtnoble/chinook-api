import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { resolver } from 'hono-openapi';
import z from 'zod';
import { type FieldError, PROBLEM_CONTENT_TYPE, type ProblemDetails, type ProblemOptions, problem } from './problem';
import { VALIDATION_CODE, VALIDATION_DETAIL } from './validation';
import { problemDetailsSchema, validationProblemSchema } from './zod';

// One occurrence of a problem, as the document the API sends for it.
export const problemExample = (
    status: ContentfulStatusCode,
    detail: string,
    options?: ProblemOptions,
): ProblemDetails => problem(status, detail, options).toProblemDetails();

// A request with one invalid value, as `validationHook` answers it.
export const validationExample = (
    field: string,
    location: FieldError['in'],
    message: string,
    code = 'invalid_type',
): ProblemDetails =>
    problemExample(400, VALIDATION_DETAIL, { code: VALIDATION_CODE, errors: [{ field, in: location, message, code }] });

// An error response for hono-openapi: a problem document, shown with these
// occurrences.
export const problemResponse = (description: string, ...examples: ProblemDetails[]) => ({
    description,
    content: { [PROBLEM_CONTENT_TYPE]: { schema: resolver(problemDetailsSchema.meta({ examples })) } },
});

// A response that is a validation failure, or another problem with the same
// status, such as a body that is not JSON.
export const validationProblemResponse = (
    description: string,
    invalid: ProblemDetails,
    ...others: ProblemDetails[]
) => ({
    description,
    content: {
        [PROBLEM_CONTENT_TYPE]: {
            schema: resolver(
                z.union([
                    validationProblemSchema.meta({ examples: [invalid] }),
                    ...(others.length ? [problemDetailsSchema.meta({ examples: others })] : []),
                ]),
            ),
        },
    },
});
