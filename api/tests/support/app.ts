import { Hono } from 'hono';
import errorHandler from '@/handlers/errorHandler';

// Mounts a route module the way the app does, with its error handler, but
// without authentication, so a test can send a request straight to the route.
export const appFor = (routes: Hono) => new Hono().onError(errorHandler).route('/', routes);

export const send = (app: Hono, method: string, path: string, body?: unknown) =>
    app.request(path, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
