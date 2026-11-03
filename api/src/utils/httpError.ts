import { HTTPException } from 'hono/http-exception';

// An error that `middleware/errorHandler` returns as `{ error }` with this
// status.
export const httpError = (status: 400 | 404 | 409 | 422, message: string) => new HTTPException(status, { message });
