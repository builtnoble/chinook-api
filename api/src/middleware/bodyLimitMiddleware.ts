import { bodyLimit } from 'hono/body-limit';
import { problem } from '@/lib/problem-details';

// Catalog rows are a few short fields, so 100 KB is far more than a valid write
// needs.
export const maxBodyBytes = 100 * 1024;

const bodyLimitMiddleware = bodyLimit({
    maxSize: maxBodyBytes,
    onError: () => problem(413, 'The request body is too large.').getResponse(),
});

export default bodyLimitMiddleware;
