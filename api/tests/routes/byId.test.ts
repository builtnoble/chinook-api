import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import type { Hono } from 'hono';
import db from '@/db';
import albumRoutes from '@/routes/albums';
import artistRoutes from '@/routes/artists';
import genreRoutes from '@/routes/genres';
import mediaTypeRoutes from '@/routes/mediaTypes';
import playlistRoutes from '@/routes/playlists';
import trackRoutes from '@/routes/tracks';

// The routes are mounted without the auth middleware and `db.query` is stubbed, so no session or database is needed.
const resources: { name: string; table: keyof typeof db.query; routes: Hono; notFound: string }[] = [
    { name: 'artists', table: 'artists', routes: artistRoutes, notFound: 'Artist not found.' },
    { name: 'albums', table: 'albums', routes: albumRoutes, notFound: 'Album not found.' },
    { name: 'genres', table: 'genres', routes: genreRoutes, notFound: 'Genre not found.' },
    { name: 'media types', table: 'media_types', routes: mediaTypeRoutes, notFound: 'Media type not found.' },
    { name: 'playlists', table: 'playlists', routes: playlistRoutes, notFound: 'Playlist not found.' },
    { name: 'tracks', table: 'tracks', routes: trackRoutes, notFound: 'Track not found.' },
];

const spies: { mockRestore: () => void }[] = [];

afterEach(() => {
    for (const spy of spies.splice(0)) {
        spy.mockRestore();
    }
});

const stubFindFirst = (table: keyof typeof db.query, row: unknown) => {
    const spy = spyOn(db.query[table] as typeof db.query.artists, 'findFirst').mockResolvedValue(row as never);

    spies.push(spy);
};

describe.each(resources)('GET /:id for $name', ({ table, routes, notFound }) => {
    it('returns 404 with an error when no row matches', async () => {
        stubFindFirst(table, undefined);

        const res = await routes.request('/1');

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: notFound });
    });

    it('returns 200 with the row in data when one matches', async () => {
        stubFindFirst(table, { id: 1 });

        const res = await routes.request('/1');

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: { id: 1 } });
    });

    it('returns 400 for an id that is not a number, without querying', async () => {
        stubFindFirst(table, { id: 1 });

        const res = await routes.request('/abc');

        expect(res.status).toBe(400);
        expect(db.query[table].findFirst).not.toHaveBeenCalled();
    });
});
