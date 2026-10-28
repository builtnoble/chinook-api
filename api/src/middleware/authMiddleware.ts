import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { auth } from '@/utils/auth';

const authMiddleware = createMiddleware<{
    Variables: {
        user: typeof auth.$Infer.Session.user | null;
        session: typeof auth.$Infer.Session.session | null;
    };
}>(async (c: Context, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
        c.set('user', null);
        c.set('session', null);

        return c.json({ message: 'Unauthorized' }, 401);
    }

    c.set('user', session.user);
    c.set('session', session.session);

    await next();
});

export default authMiddleware;
