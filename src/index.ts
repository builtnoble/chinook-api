import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { openAPIRouteHandler } from 'hono-openapi';
import api from '@/api';
import { auth } from '@/utils/auth';
import { getAllowedOrigins, stripErrorDetails } from '@/utils/helpers';

const port = process.env.APP_PORT || 3000;

const app = new Hono();

app.use('*', async (c: Context, next) => {
    const corsMiddlewareHandler = cors({
        // Under Bun `c.env` is the server object, not the process environment.
        origin: getAllowedOrigins(),
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: ['POST', 'GET', 'OPTIONS'],
        exposeHeaders: ['Content-Length'],
        maxAge: 600,
        credentials: true,
    });

    return await corsMiddlewareHandler(c, next);
});

app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
    return stripErrorDetails(await auth.handler(c.req.raw));
});

app.get('/health', async (c) =>
    c.json({
        status: 'ok',
        message: 'API healthy',
    }),
);

app.get(
    '/openapi.json',
    openAPIRouteHandler(api, {
        documentation: {
            info: {
                title: 'Chinook',
                version: '1.0.0',
                description: 'An API for Chinook sample database.',
            },
            servers: [
                {
                    url: `http://localhost:${port}`,
                    description: 'Local Server',
                },
            ],
        },
    }),
);

app.route('/', api);

export default {
    port,
    fetch: app.fetch,
};
