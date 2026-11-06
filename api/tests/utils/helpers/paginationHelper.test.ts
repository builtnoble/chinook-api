import { describe, expect, it } from 'bun:test';
import { getPageUrls } from '@/utils/helpers/paginationHelper';

describe('getPageUrls', () => {
    it('links to the previous and next page', () => {
        expect(getPageUrls('/api/tracks', 2, 3)).toEqual({
            prevPageUrl: '/api/tracks?page=1',
            nextPageUrl: '/api/tracks?page=3',
        });
    });

    it('has no previous link on the first page and no next link on the last', () => {
        expect(getPageUrls('/api/tracks', 1, 3).prevPageUrl).toBeNull();
        expect(getPageUrls('/api/tracks', 3, 3).nextPageUrl).toBeNull();
        expect(getPageUrls('/api/tracks', 1, 1)).toEqual({ prevPageUrl: null, nextPageUrl: null });
    });

    it('has no links at all with no pages', () => {
        expect(getPageUrls('/api/tracks', 1, 0)).toEqual({ prevPageUrl: null, nextPageUrl: null });
    });

    it('keeps the query, in name order and URL-encoded, with the page last', () => {
        expect(getPageUrls('/api/tracks', 1, 2, { q: 'queen & love', genre_id: 1, limit: 5 }).nextPageUrl).toBe(
            '/api/tracks?genre_id=1&limit=5&q=queen+%26+love&page=2',
        );
    });

    it('drops the current page, and what is unset or empty', () => {
        expect(getPageUrls('/api/tracks', 2, 3, { page: 2, q: '', genre_id: undefined }).prevPageUrl).toBe(
            '/api/tracks?page=1',
        );
    });
});
