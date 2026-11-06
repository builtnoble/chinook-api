import { describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { artists } from '@/db/chinookSchema';
import { containing, escapeLike, everyTerm, searchTerms } from '@/utils/helpers/searchHelper';
import { render } from '../../support/sql';

describe('searchTerms', () => {
    it('splits on any run of whitespace', () => {
        expect(searchTerms('queen love')).toEqual(['queen', 'love']);
        expect(searchTerms('queen \t\n  love')).toEqual(['queen', 'love']);
    });

    it('drops the whitespace at either end', () => {
        expect(searchTerms('  queen  ')).toEqual(['queen']);
    });

    it('has no terms for nothing, an empty search or only whitespace', () => {
        expect(searchTerms()).toEqual([]);
        expect(searchTerms('')).toEqual([]);
        expect(searchTerms('   ')).toEqual([]);
    });
});

describe('escapeLike', () => {
    it('escapes the three characters that mean something in a pattern', () => {
        expect(escapeLike('100%')).toBe('100\\%');
        expect(escapeLike('a_b')).toBe('a\\_b');
        expect(escapeLike('a\\b')).toBe('a\\\\b');
        expect(escapeLike('%_\\')).toBe('\\%\\_\\\\');
    });

    it('leaves everything else as it is', () => {
        expect(escapeLike("AC/DC's (live)")).toBe("AC/DC's (live)");
    });
});

describe('containing', () => {
    it('matches the term anywhere, ignoring case, with the pattern as a bound parameter', () => {
        expect(render(containing(artists.name, 'queen'))).toEqual({
            sql: '"artists"."name" ilike $1',
            params: ['%queen%'],
        });
    });

    it('binds the escaped term, never the text of the query', () => {
        const { sql: text, params } = render(containing(artists.name, "100%'; drop table artists; --"));

        expect(text).toBe('"artists"."name" ilike $1');
        expect(params).toEqual(["%100\\%'; drop table artists; --%"]);
    });
});

describe('everyTerm', () => {
    const match = (term: string) => sql`${artists.name} = ${term}`;

    it('has no condition without terms', () => {
        expect(everyTerm(undefined, match)).toBeUndefined();
        expect(everyTerm('  ', match)).toBeUndefined();
    });

    it('requires every term to match', () => {
        expect(render(everyTerm('queen love', match))).toEqual({
            sql: '("artists"."name" = $1 and "artists"."name" = $2)',
            params: ['queen', 'love'],
        });
    });
});
