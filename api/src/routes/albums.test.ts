/// <reference types="bun" />
import { afterEach, describe, expect, it } from 'bun:test';
import { albums, tracks } from '@/db/schema';
import albumRoutes from '@/routes/albums';
import { appFor, send } from '@/testing/app';
import { stubDb } from '@/testing/stubDb';

const app = appFor(albumRoutes);
const artist = { id: 3, name: 'Accept' };
const album = { id: 9, title: 'Restless and Wild', artist_id: 3, artist };

let stub: ReturnType<typeof stubDb>;

afterEach(() => stub.restore());

describe('POST /', () => {
    it('checks the artist is live, creates the album and answers 201 with it and its artist', async () => {
        stub = stubDb([{ id: 3 }], [{ id: 9 }], album);

        const res = await send(app, 'POST', '/', { title: 'Restless and Wild', artist_id: 3 });

        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ data: album });
        // The parent check comes first and share-locks the artist, then the insert.
        expect(stub.methods().slice(0, 4)).toEqual(['select', 'from', 'where', 'for']);
        expect(stub.calls).toContainEqual(['for', ['share']]);
        expect(stub.methods()).toContain('insert');
    });

    it('answers 422 naming artist_id when the artist does not exist or is deleted, and inserts nothing', async () => {
        stub = stubDb([]);

        const res = await send(app, 'POST', '/', { title: 'Restless and Wild', artist_id: 3 });

        expect(res.status).toBe(422);
        expect(await res.json()).toEqual({ error: 'artist_id does not refer to an existing artist.' });
        expect(stub.methods()).not.toContain('insert');
    });

    it('answers 400 when the artist is missing from the body, before any query', async () => {
        stub = stubDb();

        expect((await send(app, 'POST', '/', { title: 'Restless and Wild' })).status).toBe(400);
        expect(stub.calls).toEqual([]);
    });
});

describe('PATCH /:id', () => {
    it('answers 200 with the album after changing its title, without checking the artist', async () => {
        stub = stubDb(album, [{ id: 9 }], album);

        const res = await send(app, 'PATCH', '/9', { title: 'Restless and Wild' });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: album });
        expect(stub.calls.filter(([method]) => method === 'for')).toEqual([]);
        expect(stub.unused()).toBe(0);
    });

    it('checks the new artist is live when artist_id changes', async () => {
        stub = stubDb(album, [{ id: 3 }], [{ id: 9 }], album);

        const res = await send(app, 'PATCH', '/9', { artist_id: 3 });

        expect(res.status).toBe(200);
        expect(stub.calls).toContainEqual(['for', ['share']]);
    });

    it('answers 422 for a new artist that does not exist or is deleted, and updates nothing', async () => {
        stub = stubDb(album, []);

        const res = await send(app, 'PATCH', '/9', { artist_id: 99 });

        expect(res.status).toBe(422);
        expect(await res.json()).toEqual({ error: 'artist_id does not refer to an existing artist.' });
        expect(stub.methods()).not.toContain('update');
    });

    it('answers 404 for an unknown or deleted album, before it looks at the artist', async () => {
        stub = stubDb(undefined);

        const res = await send(app, 'PATCH', '/9', { artist_id: 99 });

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Album not found.' });
        expect(stub.methods()).not.toContain('select');
    });

    it('answers 404 when the album is deleted between the check and the update', async () => {
        stub = stubDb(album, []);

        const res = await send(app, 'PATCH', '/9', { title: 'Renamed' });

        expect(res.status).toBe(404);
    });
});

describe('DELETE /:id', () => {
    it('locks the album, counts its live tracks, soft-deletes it and answers 200 with it', async () => {
        stub = stubDb([{ id: 9 }], 0, undefined, album);

        const res = await send(app, 'DELETE', '/9');

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: album });
        expect(stub.calls).toContainEqual(['for', ['update']]);
        expect(stub.calls.filter(([method]) => method === 'update')).toEqual([['update', [albums]]]);
        expect(stub.unused()).toBe(0);
    });

    it('answers 404 when no live album has the id, and changes nothing', async () => {
        stub = stubDb([]);

        const res = await send(app, 'DELETE', '/9');

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Album not found.' });
        expect(stub.methods()).not.toContain('update');
    });

    it('answers 409 naming the tracks that block it, and changes nothing', async () => {
        stub = stubDb([{ id: 9 }], 12);

        const res = await send(app, 'DELETE', '/9');

        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({
            error: 'The album has 12 tracks. Delete them first, or pass cascade=true.',
        });
        expect(stub.methods()).not.toContain('update');
    });

    it('with cascade=true soft-deletes the tracks, then the album', async () => {
        stub = stubDb([{ id: 9 }], 12, undefined, undefined, album);

        const res = await send(app, 'DELETE', '/9?cascade=true');

        expect(res.status).toBe(200);
        expect(stub.calls.filter(([method]) => method === 'update')).toEqual([
            ['update', [tracks]],
            ['update', [albums]],
        ]);
        expect(stub.unused()).toBe(0);
    });

    it('answers 400 for a cascade value that is not true or false', async () => {
        stub = stubDb();

        expect((await send(app, 'DELETE', '/9?cascade=1')).status).toBe(400);
    });
});
