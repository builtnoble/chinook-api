import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { auth } from '@/auth';
import { problem } from '@/lib/problem-details';

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

        // RFC 6750: a request that sent a bearer token which failed is told so,
        // and one that sent none is told only the scheme.
        const sentToken = c.req.header('Authorization')?.startsWith('Bearer ');
        const challenge = sentToken ? 'Bearer error="invalid_token"' : 'Bearer';

        throw problem(401, 'Missing or invalid credentials.', { headers: { 'WWW-Authenticate': challenge } });
    }

    c.set('user', session.user);
    c.set('session', session.session);

    await next();
});

export default authMiddleware;
