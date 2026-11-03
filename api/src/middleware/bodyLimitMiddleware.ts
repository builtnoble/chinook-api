import { bodyLimit } from 'hono/body-limit';

// Catalog rows are a few short fields, so 100 KB is far more than a valid write
// needs.
export const maxBodyBytes = 100 * 1024;

const bodyLimitMiddleware = bodyLimit({
    maxSize: maxBodyBytes,
    onError: (c) => c.json({ error: 'The request body is too large.' }, 413),
});

export default bodyLimitMiddleware;
