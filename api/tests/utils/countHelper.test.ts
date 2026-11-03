import { describe, expect, it } from 'bun:test';
import { countOf } from '@/utils/countHelper';

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
