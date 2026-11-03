import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { problem } from '@/lib/problem-details';
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

        throw problem(401, 'Missing or invalid credentials.');
    }

    c.set('user', session.user);
    c.set('session', session.session);

    await next();
});

export default authMiddleware;
