import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { auth } from '@/auth';
import { problem } from '@/lib/problem-details';

// Reads stay open to any signed-in user, so only methods that change data need
// the admin role.
const readMethods = ['GET', 'HEAD'];

// Runs after authMiddleware, which has already rejected a missing session.
const requireAdminMiddleware = createMiddleware<{
    Variables: { user: typeof auth.$Infer.Session.user | null };
}>(async (c: Context, next) => {
    if (readMethods.includes(c.req.method)) {
        return await next();
    }

    if (c.get('user')?.role !== 'admin') {
        throw problem(403, 'This action requires the admin role.');
    }

    await next();
});

export default requireAdminMiddleware;
