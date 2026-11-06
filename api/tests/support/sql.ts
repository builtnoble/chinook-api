import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();

// The query text and bound parameters a condition becomes, to show what is sent
// to the database. It cannot show what Postgres does with it.
export const render = (condition: SQL | undefined) => {
    if (!condition) {
        return { sql: '', params: [] as unknown[] };
    }

    const { sql, params } = dialect.sqlToQuery(condition);

    return { sql, params };
};
