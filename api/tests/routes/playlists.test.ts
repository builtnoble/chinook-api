import { afterEach, describe, expect, it } from 'bun:test';
import { playlist_tracks as playlistTracks } from '@/db/schema';
import playlistRoutes from '@/routes/playlists';
import { appFor, send } from '../support/app';
import { stubDb } from '../support/stubDb';

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

describe('POST /:id/tracks', () => {
    const added = { playlist_id: 3, track_id: 8 };

    it('checks the playlist and the track, adds the track and answers 201 with the entry', async () => {
        stub = stubDb([{ id: 3 }], [{ id: 8 }], [added]);

        const res = await send(app, 'POST', '/3/tracks', { track_id: 8 });

        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ data: added });
        expect(stub.calls.filter(([method]) => method === 'for')).toEqual([
            ['for', ['share']],
            ['for', ['share']],
        ]);
    });

    it('answers 404 for an unknown playlist, before it looks at the track', async () => {
        stub = stubDb([]);

        const res = await send(app, 'POST', '/3/tracks', { track_id: 8 });

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Playlist not found.' });
        expect(stub.methods()).not.toContain('insert');
    });

    it('answers 422 naming track_id when the track is missing or deleted, and adds nothing', async () => {
        stub = stubDb([{ id: 3 }], []);

        const res = await send(app, 'POST', '/3/tracks', { track_id: 8 });

        expect(res.status).toBe(422);
        expect(await res.json()).toEqual({ error: 'track_id does not refer to an existing track.' });
        expect(stub.methods()).not.toContain('insert');
    });

    it('answers 409 when the track is already in the playlist', async () => {
        stub = stubDb([{ id: 3 }], [{ id: 8 }], []);

        const res = await send(app, 'POST', '/3/tracks', { track_id: 8 });

        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ error: 'The track is already in the playlist.' });
        expect(stub.methods()).toContain('onConflictDoNothing');
    });

    it('answers 400 for a body that is not just a track_id, before any query', async () => {
        stub = stubDb();

        expect((await send(app, 'POST', '/3/tracks', {})).status).toBe(400);
        expect((await send(app, 'POST', '/3/tracks', { track_id: 8, playlist_id: 9 })).status).toBe(400);
        expect((await send(app, 'POST', '/3/tracks', { track_id: 'eight' })).status).toBe(400);
        expect(stub.calls).toEqual([]);
    });
});

describe('DELETE /:id/tracks/:track_id', () => {
    it('removes the entry and answers 200 with it, leaving the track alone', async () => {
        stub = stubDb([{ playlist_id: 3, track_id: 8 }]);

        const res = await send(app, 'DELETE', '/3/tracks/8');

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: { playlist_id: 3, track_id: 8 } });
        expect(stub.calls.filter(([method]) => method === 'delete').map(([, args]) => args[0])).toEqual([
            playlistTracks,
        ]);
    });

    it('answers 404 when the playlist does not contain the track', async () => {
        stub = stubDb([]);

        const res = await send(app, 'DELETE', '/3/tracks/8');

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'The playlist does not contain that track.' });
    });

    it('answers 400 for an id that is not a number', async () => {
        stub = stubDb();

        expect((await send(app, 'DELETE', '/3/tracks/abc')).status).toBe(400);
        expect(stub.calls).toEqual([]);
    });
});
