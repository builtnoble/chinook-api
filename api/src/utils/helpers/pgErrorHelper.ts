import isObject from 'lodash-es/isObject';

export type PgError = { code: string; table?: string; constraint?: string };

// Drizzle wraps the driver error, so the Postgres error with its SQLSTATE
// `code` sits somewhere down the `cause` chain.
export const findPgError = (error: unknown): PgError | undefined => {
    const seen = new Set<unknown>();
    let current = error;

    while (isObject(current) && !seen.has(current)) {
        seen.add(current);

        const { code, table, constraint, cause } = current as Record<string, unknown>;

        // A SQLSTATE is five characters starting with a digit, which tells it
        // from Node codes such as ECONNREFUSED.
        if (typeof code === 'string' && /^[0-9][0-9A-Z]{4}$/.test(code)) {
            return {
                code,
                table: typeof table === 'string' ? table : undefined,
                constraint: typeof constraint === 'string' ? constraint : undefined,
            };
        }

        current = cause;
    }

    return undefined;
};
