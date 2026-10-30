import { afterEach, describe, expect, it } from 'bun:test';
import type { Hono } from 'hono';
import genreRoutes from '@/routes/genres';
import mediaTypeRoutes from '@/routes/mediaTypes';
import { appFor, send } from '../support/app';
import { stubDb } from '../support/stubDb';

// Genres and media types are the same shape: a name, soft-deleted, and blocked from deletion while tracks use them.
const resources: { name: string; routes: Hono; notFound: string; used: string }[] = [
    { name: 'genre', routes: genreRoutes, notFound: 'Genre not found.', used: 'The genre is used by' },
    {
        name: 'media type',
        routes: mediaTypeRoutes,
        notFound: 'Media type not found.',
        used: 'The media type is used by',
    },
];

let stub: ReturnType<typeof stubDb>;

afterEach(() => stub.restore());

describe.each(resources)('writes to $name', ({ routes, notFound, used }) => {
    const app = appFor(routes);

    describe('POST /', () => {
        it('creates it and answers 201 with the row', async () => {
            stub = stubDb([{ id: 9, name: 'Metal' }]);

            const res = await send(app, 'POST', '/', { name: 'Metal' });

            expect(res.status).toBe(201);
            expect(await res.json()).toEqual({ data: { id: 9, name: 'Metal' } });
            expect(stub.methods()).toEqual(['insert', 'values', 'returning']);
        });

        it.each([
            ['an empty body', {}],
            ['an empty name', { name: '' }],
            ['an id', { id: 3, name: 'Metal' }],
            ['an unknown key', { name: 'Metal', colour: 'red' }],
        ])('answers 400 for %s, before any query', async (_, body) => {
            stub = stubDb();

            const res = await send(app, 'POST', '/', body);

            expect(res.status).toBe(400);
            expect(stub.calls).toEqual([]);
        });

        it('answers 400 for malformed JSON', async () => {
            stub = stubDb();

            const res = await send(app, 'POST', '/', '{"name": ');

            expect(res.status).toBe(400);
            expect(await res.json()).toEqual({ error: 'Malformed JSON in request body' });
        });

        it('maps a unique violation to 409 without the SQL', async () => {
            stub = stubDb(Object.assign(new Error('insert into "genres" ...'), { cause: { code: '23505' } }));

            const res = await send(app, 'POST', '/', { name: 'Metal' });

            expect(res.status).toBe(409);
            expect(await res.text()).not.toContain('insert');
        });
    });

    describe('PATCH /:id', () => {
        it('updates it and answers 200 with the row', async () => {
            stub = stubDb([{ id: 4, name: 'Renamed' }]);

            const res = await send(app, 'PATCH', '/4', { name: 'Renamed' });

            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ data: { id: 4, name: 'Renamed' } });
        });

        it('answers 404 when no live row has the id', async () => {
            stub = stubDb([]);

            const res = await send(app, 'PATCH', '/4', { name: 'Renamed' });

            expect(res.status).toBe(404);
            expect(await res.json()).toEqual({ error: notFound });
        });

        it.each([
            ['an empty body', {}],
            ['an unknown key', { colour: 'red' }],
        ])('answers 400 for %s', async (_, body) => {
            stub = stubDb();

            const res = await send(app, 'PATCH', '/4', body);

            expect(res.status).toBe(400);
            expect(stub.calls).toEqual([]);
        });

        it('answers 400 for an id that is not a number', async () => {
            stub = stubDb();

            expect((await send(app, 'PATCH', '/abc', { name: 'Renamed' })).status).toBe(400);
        });
    });

    describe('DELETE /:id', () => {
        it('locks the row, counts the live tracks and soft-deletes it, answering 200 with the row', async () => {
            stub = stubDb([{ id: 4 }], 0, [{ id: 4, name: 'Rock' }]);

            const res = await send(app, 'DELETE', '/4');

            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ data: { id: 4, name: 'Rock' } });
            expect(stub.calls).toContainEqual(['for', ['update']]);
            expect(stub.methods()).toContain('update');
            expect(stub.unused()).toBe(0);
        });

        it('answers 404 when no live row has the id, and changes nothing', async () => {
            stub = stubDb([]);

            const res = await send(app, 'DELETE', '/4');

            expect(res.status).toBe(404);
            expect(await res.json()).toEqual({ error: notFound });
            expect(stub.methods()).not.toContain('update');
        });

        it('answers 409 with the count while live tracks use it, and changes nothing', async () => {
            stub = stubDb([{ id: 4 }], 3);

            const res = await send(app, 'DELETE', '/4');

            expect(res.status).toBe(409);
            expect(await res.json()).toEqual({ error: `${used} 3 tracks. Reassign them first.` });
            expect(stub.methods()).not.toContain('update');
        });

        it('says "1 track" for a single track', async () => {
            stub = stubDb([{ id: 4 }], 1);

            const res = await send(app, 'DELETE', '/4');

            expect(await res.json()).toEqual({ error: `${used} 1 track. Reassign them first.` });
        });
    });
});
