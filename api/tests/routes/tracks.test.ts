import { afterEach, describe, expect, it } from 'bun:test';
import { tracks } from '@/db/chinookSchema';
import trackRoutes from '@/routes/tracks';
import { appFor, send } from '../support/app';
import { stubDb } from '../support/stubDb';

const app = appFor(trackRoutes);
const track = {
    id: 5,
    name: 'Intro',
    album_id: 1,
    genre_id: 1,
    media_type_id: 1,
    album: {},
    genre: {},
    media_type: {},
};
const body = { name: 'Intro', album_id: 1, genre_id: 1, media_type_id: 1, milliseconds: 1000, unit_price: '0.99' };

let stub: ReturnType<typeof stubDb>;

afterEach(() => stub.restore());

const shareLocks = () => stub.calls.filter(([method, args]) => method === 'for' && args[0] === 'share').length;

describe('POST /', () => {
    it('checks the album, genre and media type are live, creates the track and answers 201 with it', async () => {
        stub = stubDb([{ id: 1 }], [{ id: 1 }], [{ id: 1 }], [{ id: 5 }], track);

        const res = await send(app, 'POST', '/', body);

        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ data: track });
        expect(shareLocks()).toBe(3);
        expect(stub.unused()).toBe(0);
    });

    it('does not look up an album or genre it is not given, or that is null', async () => {
        stub = stubDb([{ id: 1 }], [{ id: 5 }], track);

        const res = await send(app, 'POST', '/', { ...body, album_id: null, genre_id: undefined });

        expect(res.status).toBe(201);
        expect(shareLocks()).toBe(1);
    });

    it.each([
        ['album_id', 'album', [[]]],
        ['genre_id', 'genre', [[{ id: 1 }], []]],
        ['media_type_id', 'media type', [[{ id: 1 }], [{ id: 1 }], []]],
    ])(
        'answers 422 naming %s when that parent is missing or deleted, and inserts nothing',
        async (field, label, script) => {
            stub = stubDb(...script);

            const res = await send(app, 'POST', '/', body);

            expect(res.status).toBe(422);
            expect(await res.json()).toEqual({ error: `${field} does not refer to an existing ${label}.` });
            expect(stub.methods()).not.toContain('insert');
        },
    );

    it.each([
        ['a missing name', { ...body, name: undefined }],
        ['a price the column cannot hold', { ...body, unit_price: 'free' }],
        ['a length of zero', { ...body, milliseconds: 0 }],
        ['an id', { ...body, id: 9 }],
    ])('answers 400 for %s, before any query', async (_, invalid) => {
        stub = stubDb();

        expect((await send(app, 'POST', '/', invalid)).status).toBe(400);
        expect(stub.calls).toEqual([]);
    });
});

describe('PATCH /:id', () => {
    it('answers 200 with the track after changing a field that has no parent, checking no parent', async () => {
        stub = stubDb(track, [{ id: 5 }], track);

        const res = await send(app, 'PATCH', '/5', { unit_price: '1.29' });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: track });
        expect(shareLocks()).toBe(0);
        expect(stub.unused()).toBe(0);
    });

    it('checks only the parents it is given, and allows clearing the album or genre with null', async () => {
        stub = stubDb(track, [{ id: 2 }], [{ id: 5 }], track);

        const res = await send(app, 'PATCH', '/5', { genre_id: 2, album_id: null });

        expect(res.status).toBe(200);
        expect(shareLocks()).toBe(1);
    });

    it('answers 422 for a parent that is missing or deleted, and updates nothing', async () => {
        stub = stubDb(track, []);

        const res = await send(app, 'PATCH', '/5', { album_id: 99 });

        expect(res.status).toBe(422);
        expect(await res.json()).toEqual({ error: 'album_id does not refer to an existing album.' });
        expect(stub.methods()).not.toContain('update');
    });

    it('answers 404 for an unknown or deleted track, before it looks at any parent', async () => {
        stub = stubDb(undefined);

        const res = await send(app, 'PATCH', '/5', { album_id: 99 });

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Track not found.' });
        expect(shareLocks()).toBe(0);
    });

    it('answers 400 for an empty body', async () => {
        stub = stubDb();

        expect((await send(app, 'PATCH', '/5', {})).status).toBe(400);
    });
});

describe('DELETE /:id', () => {
    it('soft-deletes the track and answers 200 with it and its relations', async () => {
        stub = stubDb([{ id: 5 }], track);

        const res = await send(app, 'DELETE', '/5');

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: track });
        expect(stub.calls.filter(([method]) => method === 'update')).toEqual([['update', [tracks]]]);
        // Only a soft delete: the row, and with it every invoice line that
        // points at it, is kept.
        expect(stub.methods()).not.toContain('delete');
    });

    it('answers 404 when no live track has the id, and reads nothing back', async () => {
        stub = stubDb([]);

        const res = await send(app, 'DELETE', '/5');

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Track not found.' });
        expect(stub.methods()).not.toContain('findFirst');
    });
});
