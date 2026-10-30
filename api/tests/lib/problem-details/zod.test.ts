import { describe, expect, it } from 'bun:test';
import { problem } from '@/lib/problem-details';
import { fieldErrorSchema, problemDetailsSchema, validationProblemSchema } from '@/lib/problem-details/zod';

describe('problemDetailsSchema', () => {
    it('accepts what the library produces', () => {
        expect(problemDetailsSchema.safeParse(problem(404, 'Gone.').toProblemDetails()).success).toBe(true);
        expect(problemDetailsSchema.safeParse(problem(401).toProblemDetails()).success).toBe(true);
    });

    it('keeps extension members, since a problem may carry them', () => {
        const parsed = problemDetailsSchema.parse({ type: 'about:blank', title: 'T', status: 429, retry_in: 5 });

        expect(parsed.retry_in).toBe(5);
    });

    it('requires a type, a title and a status', () => {
        expect(problemDetailsSchema.safeParse({ title: 'T', status: 400 }).success).toBe(false);
        expect(problemDetailsSchema.safeParse({ type: 'about:blank', status: 400 }).success).toBe(false);
        expect(problemDetailsSchema.safeParse({ type: 'about:blank', title: 'T' }).success).toBe(false);
    });
});

describe('validationProblemSchema', () => {
    const errors = [{ field: '/name', in: 'body' as const, message: 'Required', code: 'invalid_type' }];

    it('accepts a validation problem and requires its errors', () => {
        const document = problem(400, 'Bad.', { code: 'validation_failed', errors }).toProblemDetails();

        expect(validationProblemSchema.safeParse(document).success).toBe(true);
        expect(validationProblemSchema.safeParse({ ...document, errors: undefined }).success).toBe(false);
    });
});

describe('fieldErrorSchema', () => {
    it('only accepts a part of the request the library can name', () => {
        expect(fieldErrorSchema.safeParse({ field: '/a', in: 'body', message: 'm' }).success).toBe(true);
        expect(fieldErrorSchema.safeParse({ field: '/a', in: 'nowhere', message: 'm' }).success).toBe(false);
    });
});
