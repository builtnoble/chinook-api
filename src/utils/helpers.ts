import isArray from 'lodash-es/isArray';
import isObject from 'lodash-es/isObject';
import isPlainObject from 'lodash-es/isPlainObject';
import omit from 'lodash-es/omit';
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

// Browser origins allowed to call the API: a comma-separated list in CORS_ORIGINS.
export const getAllowedOrigins = (): string[] =>
    (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

// Better Auth attaches the raw error as `details` to some failures, which for a database error is the
// failing SQL, its values and the underlying cause. Drop it from error responses before they leave the API.
export const stripErrorDetails = async (res: Response): Promise<Response> => {
    if (res.status < 400 || !res.headers.get('Content-Type')?.includes('application/json')) {
        return res;
    }

    const body: unknown = await res
        .clone()
        .json()
        .catch(() => undefined);

    if (!isPlainObject(body) || !('details' in (body as object))) {
        return res;
    }

    const headers = new Headers(res.headers);
    headers.delete('Content-Length');

    return new Response(JSON.stringify(omit(body as object, 'details')), {
        status: res.status,
        statusText: res.statusText,
        headers,
    });
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
