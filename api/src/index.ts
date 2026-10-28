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
            tags: [
                { name: 'Albums', description: 'Albums, each with the artist who made it.' },
                { name: 'Artists', description: 'Artists who have made albums.' },
                { name: 'Genres', description: 'Musical genres that tracks belong to.' },
                { name: 'Media Types', description: 'File formats that tracks are encoded as.' },
                { name: 'Playlists', description: 'Named playlists.' },
                { name: 'Tracks', description: 'Tracks, with their album, genre and media type.' },
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        description: 'The `token` returned in the body of the sign-up and sign-in responses.',
                    },
                },
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
