import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { findPgError } from '@/utils/helpers';

// The Postgres errors a caller can cause, by SQLSTATE. The messages are fixed: the driver's own message holds the SQL.
const pgErrors: Record<string, { status: ContentfulStatusCode; error: string }> = {
    '23505': { status: 409, error: 'A row with that value already exists.' },
    '23503': { status: 422, error: 'The row refers to a parent that does not exist.' },
    '22001': { status: 422, error: 'A value is too long for its column.' },
};

const errorHandler: ErrorHandler = (error, c) => {
    // Raised on purpose, for example by the validator for malformed JSON, so its message is safe to return.
    if (error instanceof HTTPException) {
        return error.res ? error.getResponse() : c.json({ error: error.message }, error.status);
    }

    const mapped = pgErrors[findPgError(error)?.code ?? ''];

    if (mapped) {
        return c.json({ error: mapped.error }, mapped.status);
    }

    console.error(error);

    return c.json({ error: 'Internal server error.' }, 500);
};

export default errorHandler;
