import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { auth } from '@/utils/auth';

// Reads stay open to any signed-in user, so only methods that change data need
// the admin role.
const readMethods = ['GET', 'HEAD'];

// Runs after authMiddleware, which has already rejected a missing session.
const requireAdmin = createMiddleware<{
    Variables: { user: typeof auth.$Infer.Session.user | null };
}>(async (c: Context, next) => {
    if (readMethods.includes(c.req.method)) {
        return await next();
    }

    if (c.get('user')?.role !== 'admin') {
        return c.json({ error: 'This action requires the admin role.' }, 403);
    }

    await next();
});

export default requireAdmin;
