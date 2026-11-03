import { describe, expect, it } from 'bun:test';
import { countOf, findPgError } from '@/utils/helpers';

describe('findPgError', () => {
    const pg = { code: '23503', table: 'albums', constraint: 'albums_artist_id_fkey' };

    it('finds the Postgres error on the error itself', () => {
        expect(findPgError(Object.assign(new Error('x'), pg))).toEqual(pg);
    });

    it('walks the cause chain, as with a Drizzle error that wraps the driver error', () => {
        const wrapped = new Error('Failed query', {
            cause: new Error('outer', { cause: Object.assign(new Error('inner'), pg) }),
        });

        expect(findPgError(wrapped)).toEqual(pg);
    });

    it('returns nothing for an error with no SQLSTATE, including a Node system error code', () => {
        expect(findPgError(new Error('plain'))).toBeUndefined();
        expect(findPgError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))).toBeUndefined();
        expect(findPgError('not an error')).toBeUndefined();
        expect(findPgError(undefined)).toBeUndefined();
    });

    it('stops on a cause that loops back on itself', () => {
        const loop: { cause?: unknown } = {};
        loop.cause = loop;

        expect(findPgError(loop)).toBeUndefined();
    });
});

describe('countOf', () => {
    it.each([
        [0, '0 tracks'],
        [1, '1 track'],
        [2, '2 tracks'],
        [11, '11 tracks'],
    ])('writes %i as "%s"', (count, expected) => {
        expect(countOf(count, 'track')).toBe(expected);
    });
});
