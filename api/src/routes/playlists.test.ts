/// <reference types="bun" />
import { afterEach, describe, expect, it } from 'bun:test';
import playlistRoutes from '@/routes/playlists';
import { appFor, send } from '@/testing/app';
import { stubDb } from '@/testing/stubDb';

const app = appFor(playlistRoutes);

let stub: ReturnType<typeof stubDb>;

afterEach(() => stub.restore());

describe('POST /', () => {
    it('creates a playlist and answers 201 with the row', async () => {
        stub = stubDb([{ id: 19, name: 'Road trip' }]);

        const res = await send(app, 'POST', '/', { name: 'Road trip' });

        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ data: { id: 19, name: 'Road trip' } });
    });

    it('answers 400 for a body that is not valid, before any query', async () => {
        stub = stubDb();

        expect((await send(app, 'POST', '/', { name: '' })).status).toBe(400);
        expect((await send(app, 'POST', '/', { name: 'x', tracks: [1] })).status).toBe(400);
        expect(stub.calls).toEqual([]);
    });
});

describe('PATCH /:id', () => {
    it('renames the playlist and answers 200 with the row', async () => {
        stub = stubDb([{ id: 3, name: 'Renamed' }]);

        const res = await send(app, 'PATCH', '/3', { name: 'Renamed' });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: { id: 3, name: 'Renamed' } });
    });

    it('answers 404 for an unknown id', async () => {
        stub = stubDb([]);

        const res = await send(app, 'PATCH', '/3', { name: 'Renamed' });

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Playlist not found.' });
    });

    it('answers 400 for an empty body', async () => {
        stub = stubDb();

        expect((await send(app, 'PATCH', '/3', {})).status).toBe(400);
    });
});

describe('DELETE /:id', () => {
    it('removes the row for good and answers 200 with it', async () => {
        stub = stubDb([{ id: 3, name: 'Music' }]);

        const res = await send(app, 'DELETE', '/3');

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: { id: 3, name: 'Music' } });
        expect(stub.methods()).toEqual(['delete', 'where', 'returning']);
    });

    it('answers 404 for an unknown id', async () => {
        stub = stubDb([]);

        const res = await send(app, 'DELETE', '/3');

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Playlist not found.' });
    });
});
