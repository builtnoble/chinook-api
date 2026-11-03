import isArray from 'lodash-es/isArray';
import isObject from 'lodash-es/isObject';
import snakeCase from 'lodash-es/snakeCase';
import transform from 'lodash-es/transform';
import type { CamelCasedPropertiesDeep, SnakeCase } from 'type-fest';
import { type ZodObject, type ZodRawShape, z } from 'zod';

export const getPageUrls = (
    path: string,
    currPage: number,
    totalPages: number,
): { prevPageUrl: string | null; nextPageUrl: string | null } => {
    const prevPageNum = currPage - 1;
    const prevPageUrl = prevPageNum === 0 ? null : `${path}?page=${prevPageNum}`;

    const nextPageNum = currPage + 1;
    const nextPageUrl = totalPages === 1 || currPage === totalPages ? null : `${path}?page=${nextPageNum}`;

    return { prevPageUrl, nextPageUrl };
};

// Browser origins allowed to call the API: a comma-separated list in
// CORS_ORIGINS.
export const getAllowedOrigins = (): string[] =>
    (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

// The address clients use for the API, which Better Auth and the Origin guard
// both trust.
export const getBaseUrl = (): string => process.env.BETTER_AUTH_URL || 'http://localhost:3000';

// "1 track", "3 tracks".
export const countOf = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

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

export const snakeCaseKeys = <T extends CamelCasedPropertiesDeep<object>>(obj: T): SnakeCase<T> => {
    return transform(
        obj,
        (result, value, key) => {
            const newKey = typeof key === 'string' ? snakeCase(key) : key;

            const transformedValue = isObject(value) ? snakeCaseKeys(value as object) : value;

            (result as Record<PropertyKey, unknown>)[newKey as PropertyKey] = transformedValue;
        },
        isArray(obj) ? [] : {},
    ) as SnakeCase<T>;
};

export const snakeCaseSchema = <T extends ZodObject<ZodRawShape>>(
    schema: T,
): ZodObject<Record<string, z.ZodTypeAny>> => {
    const shape = schema.shape;

    const snakeCasedShape = transform(
        shape,
        (result, value, key) => {
            const snakeKey = snakeCase(key);
            result[snakeKey] = value as z.ZodTypeAny;
        },
        {} as Record<string, z.ZodTypeAny>,
    );

    return z.object(snakeCasedShape);
};
