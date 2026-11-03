import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import errorHandler from '@/middleware/errorHandler';
import { httpError } from '@/utils/httpError';

describe('httpError', () => {
    it('is an HTTPException with the status and the message', () => {
        const error = httpError(409, 'Nothing to see.');

        expect(error).toBeInstanceOf(HTTPException);
        expect(error.status).toBe(409);
        expect(error.message).toBe('Nothing to see.');
    });

    it.each([400, 404, 409, 422] as const)(
        'is answered by the error handler as { error } with status %i',
        async (status) => {
            const app = new Hono().onError(errorHandler).get('/', () => {
                throw httpError(status, 'Nothing to see.');
            });
            const res = await app.request('/');

            expect(res.status).toBe(status);
            expect(await res.json()).toEqual({ error: 'Nothing to see.' });
        },
    );
});
