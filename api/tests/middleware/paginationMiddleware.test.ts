import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import errorHandler from '@/handlers/errorHandler';
import { paginateBy } from '@/middleware/paginationMiddleware';
import { validate } from '@/utils/helpers/requestValidationHelper';
import { querySchema } from '@/utils/schema/requestSchema';
import { problemBody } from '../support/problem';

const appFor = (totalItems: number) =>
    new Hono().onError(errorHandler).get(
        '/',
        validate('query', querySchema),
        paginateBy(async () => totalItems),
        (c) => c.json(c.get('pagination' as never)),
    );

describe('paginateBy', () => {
    it('pages the rows it is told to count', async () => {
        const res = await appFor(25).request('/?page=2&limit=10');

        expect(await res.json()).toEqual({
            currentPage: 2,
            perPage: 10,
            offset: 10,
            totalItems: 25,
            totalPages: 3,
            prevPageUrl: '/?limit=10&page=1',
            nextPageUrl: '/?limit=10&page=3',
        });
    });

    it('lists up to 10 by default, or the total if fewer', async () => {
        expect(((await (await appFor(25).request('/')).json()) as { perPage: number }).perPage).toBe(10);
        expect(((await (await appFor(4).request('/')).json()) as { perPage: number }).perPage).toBe(4);
    });

    it('has no next page on the last page', async () => {
        const body = (await (await appFor(25).request('/?page=3')).json()) as { nextPageUrl: string | null };

        expect(body.nextPageUrl).toBeNull();
    });

    it('answers 400 for a page or a limit out of range', async () => {
        const page = await appFor(25).request('/?page=4');
        const limit = await appFor(25).request('/?limit=26');

        expect(page.status).toBe(400);
        expect(await page.json()).toEqual(problemBody(400, 'Page cannot exceed 3.', 'page_out_of_range'));
        expect(limit.status).toBe(400);
        expect(await limit.json()).toEqual(problemBody(400, 'Limit cannot exceed 25.', 'limit_out_of_range'));
    });

    describe('with no rows', () => {
        it('answers with one empty page, and no previous or next page', async () => {
            const res = await appFor(0).request('/');

            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({
                currentPage: 1,
                perPage: 0,
                offset: 0,
                totalItems: 0,
                totalPages: 0,
                prevPageUrl: null,
                nextPageUrl: null,
            });
        });

        it('answers 400 for a second page', async () => {
            const res = await appFor(0).request('/?page=2');

            expect(res.status).toBe(400);
            expect(await res.json()).toEqual(problemBody(400, 'Page cannot exceed 1.', 'page_out_of_range'));
        });
    });
});
