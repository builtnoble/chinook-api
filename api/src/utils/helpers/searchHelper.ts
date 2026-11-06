import { and, ilike, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// The words of a search, which is split on whitespace. An empty or missing
// search has none.
export const searchTerms = (q?: string): string[] => q?.split(/\s+/).filter(Boolean) ?? [];

// `\`, `%` and `_` mean something in a LIKE pattern, so each one is escaped to
// match as itself.
export const escapeLike = (term: string) => term.replace(/[\\%_]/g, '\\$&');

// The term anywhere in the column, ignoring case. The pattern is a bound
// parameter.
export const containing = (column: AnyPgColumn, term: string) => ilike(column, `%${escapeLike(term)}%`);

// Every term has to match, and `matchTerm` says what matching one is: usually
// an `or` over the fields. With no terms there is no condition.
export const everyTerm = (q: string | undefined, matchTerm: (term: string) => SQL | undefined) =>
    and(...searchTerms(q).map(matchTerm));
