import { afterEach, describe, expect, it } from 'bun:test';
import { albums, artists, tracks } from '@/db/chinookSchema';
import artistRoutes from '@/routes/artists';
import { appFor, send } from '../support/app';
import { problemBody } from '../support/problem';
import { stubDb } from '../support/stubDb';

const app = appFor(artistRoutes);
const row = { id: 7, name: 'AC/DC' };

let stub: ReturnType<typeof stubDb>;

afterEach(() => stub.restore());

describe('POST /', () => {
    it('creates an artist and answers 201 with the row', async () => {
        stub = stubDb([row]);

        const res = await send(app, 'POST', '/', { name: 'AC/DC' });

        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ data: row });
    });

    it('answers 400 for a body that is not valid, before any query', async () => {
        stub = stubDb();

        expect((await send(app, 'POST', '/', {})).status).toBe(400);
        expect((await send(app, 'POST', '/', { name: 'x', deleted_at: null })).status).toBe(400);
        expect(stub.calls).toEqual([]);
    });
});

describe('PATCH /:id', () => {
    it('updates a live artist and answers 200 with the row', async () => {
        stub = stubDb([row]);

        const res = await send(app, 'PATCH', '/7', { name: 'AC/DC' });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: row });
    });

    it('answers 404 when no live artist has the id', async () => {
        stub = stubDb([]);

        const res = await send(app, 'PATCH', '/7', { name: 'AC/DC' });

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual(problemBody(404, 'Artist not found.'));
    });
});

describe('DELETE /:id', () => {
    // The queries a delete runs, in order: lock the artist, lock its live
    // albums, then the soft deletes.
    it('soft-deletes an artist with no albums, locking it first, and answers 200 with the row', async () => {
        stub = stubDb([{ id: 7 }], [], [row]);

        const res = await send(app, 'DELETE', '/7');

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: row });
        expect(stub.calls.filter(([method]) => method === 'for')).toEqual([
            ['for', ['update']],
            ['for', ['update']],
        ]);
        expect(stub.calls.filter(([method]) => method === 'update')).toEqual([['update', [artists]]]);
        expect(stub.unused()).toBe(0);
    });

    it('answers 404 when no live artist has the id, and changes nothing', async () => {
        stub = stubDb([]);

        const res = await send(app, 'DELETE', '/7');

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual(problemBody(404, 'Artist not found.'));
        expect(stub.methods()).not.toContain('update');
    });

    it('answers 409 naming the albums that block it, and changes nothing', async () => {
        stub = stubDb([{ id: 7 }], [{ id: 1 }, { id: 2 }]);

        const res = await send(app, 'DELETE', '/7');

        expect(res.status).toBe(409);
        expect(await res.json()).toEqual(
            problemBody(409, 'The artist has 2 albums. Delete them first, or pass cascade=true.', 'delete_blocked'),
        );
        expect(stub.methods()).not.toContain('update');
    });

    it('says "1 album" for a single album', async () => {
        stub = stubDb([{ id: 7 }], [{ id: 1 }]);

        const res = await send(app, 'DELETE', '/7');

        expect(await res.json()).toEqual(
            problemBody(409, 'The artist has 1 album. Delete them first, or pass cascade=true.', 'delete_blocked'),
        );
    });

    it('with cascade=true soft-deletes the tracks, then the albums, then the artist', async () => {
        stub = stubDb([{ id: 7 }], [{ id: 1 }, { id: 2 }], undefined, undefined, [row]);

        const res = await send(app, 'DELETE', '/7?cascade=true');

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: row });
        // The children go first, so a failure part way leaves the artist, and
        // the transaction rolls all of it back.
        expect(stub.calls.filter(([method]) => method === 'update')).toEqual([
            ['update', [tracks]],
            ['update', [albums]],
            ['update', [artists]],
        ]);
        expect(stub.unused()).toBe(0);
    });

    it('with cascade=true and no albums behaves like a plain delete', async () => {
        stub = stubDb([{ id: 7 }], [], [row]);

        const res = await send(app, 'DELETE', '/7?cascade=true');

        expect(res.status).toBe(200);
        expect(stub.calls.filter(([method]) => method === 'update')).toEqual([['update', [artists]]]);
    });

    it('treats cascade=false as no cascade', async () => {
        stub = stubDb([{ id: 7 }], [{ id: 1 }]);

        expect((await send(app, 'DELETE', '/7?cascade=false')).status).toBe(409);
    });

    it('answers 400 for a cascade value that is not true or false, before any query', async () => {
        stub = stubDb();

        expect((await send(app, 'DELETE', '/7?cascade=maybe')).status).toBe(400);
        expect(stub.calls).toEqual([]);
    });
});
