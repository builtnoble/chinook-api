import { problem, problemDetailsHandler } from '@/lib/problem-details';
import { findPgError } from '@/utils/pgErrorHelper';

// The Postgres errors a caller can cause, by SQLSTATE. The messages are fixed:
// the driver's own message holds the SQL.
const pgProblems: Record<string, { status: 409 | 422; detail: string; code: string }> = {
    '23505': { status: 409, detail: 'A row with that value already exists.', code: 'duplicate_value' },
    '23503': { status: 422, detail: 'The row refers to a parent that does not exist.', code: 'invalid_reference' },
    '22001': { status: 422, detail: 'A value is too long for its column.', code: 'value_too_long' },
};

const errorHandler = problemDetailsHandler({
    mapError: (error) => {
        const mapped = pgProblems[findPgError(error)?.code ?? ''];

        return mapped && problem(mapped.status, mapped.detail, { code: mapped.code, cause: error });
    },
    onUnhandledError: (error) => console.error(error),
});

export default errorHandler;
