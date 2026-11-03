import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { problem } from '@/lib/problem-details';
import { getAllowedOrigins, getBaseUrl } from '@/utils/helpers/envHelper';

const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

// A browser sends its cookies on a cross-site request, so a page on another
// origin could make a signed-in admin's browser write. The guard closes that
// for cookie-authenticated writes by requiring a trusted `Origin`. Hono's own
// csrf() only looks at form content types, so it would let JSON writes through.
// A bearer token has to be set by the caller's own code, so those requests skip
// the guard.
const originGuardMiddleware = createMiddleware(async (c: Context, next) => {
    const usesCookie = c.req.header('Cookie') && !c.req.header('Authorization')?.startsWith('Bearer ');

    if (safeMethods.includes(c.req.method) || !usesCookie) {
        return await next();
    }

    const origin = c.req.header('Origin');

    if (!origin || ![...getAllowedOrigins(), new URL(getBaseUrl()).origin].includes(origin)) {
        throw problem(403, 'The request comes from an origin that is not allowed.', { code: 'origin_not_allowed' });
    }

    await next();
});

export default originGuardMiddleware;
