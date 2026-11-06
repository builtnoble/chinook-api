import { afterEach, describe, expect, it } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import type { Hono } from 'hono';
import albumRoutes from '@/routes/albums';
import artistRoutes from '@/routes/artists';
import genreRoutes from '@/routes/genres';
import mediaTypeRoutes from '@/routes/mediaTypes';
import playlistRoutes from '@/routes/playlists';
import trackRoutes from '@/routes/tracks';
import { appFor, send } from '../support/app';
import { problemBody } from '../support/problem';
import { render } from '../support/sql';
import { stubDb } from '../support/stubDb';

// The stub stands in for the database, so these show what each list route
// counts and lists with, and what it answers. Whether a row matches is for
// Postgres.

const resources: { name: string; routes: Hono; filters: Record<string, string>; deletedAt: boolean }[] = [
    { name: 'artists', routes: artistRoutes, filters: {}, deletedAt: true },
    { name: 'albums', routes: albumRoutes, filters: { artist_id: '4' }, deletedAt: true },
    { name: 'genres', routes: genreRoutes, filters: {}, deletedAt: true },
    { name: 'media types', routes: mediaTypeRoutes, filters: {}, deletedAt: true },
    { name: 'playlists', routes: playlistRoutes, filters: {}, deletedAt: false },
    {
        name: 'tracks',
        routes: trackRoutes,
        filters: { album_id: '2', genre_id: '3', media_type_id: '1', not_in_playlist_id: '7' },
        deletedAt: true,
    },
];

let stub: ReturnType<typeof stubDb>;

afterEach(() => stub.restore());

const call = (method: string) => stub.calls.find(([name]) => name === method)?.[1] as unknown[];

const query = (params: Record<string, string>) => `/?${new URLSearchParams(params)}`;

describe.each(resources)('GET / for $name', ({ routes, filters, deletedAt }) => {
    const app = appFor(routes);

    it('counts and lists with the same condition, built from the query', async () => {
        stub = stubDb(25, []);

        const res = await send(app, 'GET', query({ q: ' ro ck ', limit: '10', ...filters }));

        expect(res.status).toBe(200);

        const counted = render(call('$count')[1] as SQL);
        const listed = render((call('findMany')[0] as { where: SQL }).where);

        expect(counted).toEqual(listed);
        expect(counted.params).toContain('%ro%');
        expect(counted.params).toContain('%ck%');
        expect(counted.params).toEqual(expect.arrayContaining(Object.values(filters).map(Number)));
        expect(stub.unused()).toBe(0);
    });

    it('lists by id, and leaves deleted rows out of the count and the list', async () => {
        stub = stubDb(2, []);

        await send(app, 'GET', '/');

        const { orderBy, where } = call('findMany')[0] as { orderBy: unknown; where?: SQL };

        expect(typeof orderBy).toBe('function');
        expect(render(where).sql.includes('deleted_at" is null')).toBe(deletedAt);
    });

    it('counts the filtered rows in the pagination, and the links keep the filters', async () => {
        stub = stubDb(25, []);

        const res = await send(app, 'GET', query({ q: 'rock & roll', limit: '10', page: '2', ...filters }));
        const { pagination } = (await res.json()) as { pagination: Record<string, unknown> };
        const kept = new URLSearchParams({ ...filters, limit: '10', q: 'rock & roll' });
        const sorted = new URLSearchParams([...kept].sort(([a], [b]) => a.localeCompare(b)));

        expect(pagination).toMatchObject({ currentPage: 2, perPage: 10, totalItems: 25, totalPages: 3 });
        expect(pagination.prevPageUrl).toBe(`/?${sorted}&page=1`);
        expect(pagination.nextPageUrl).toBe(`/?${sorted}&page=3`);
        expect(String(pagination.nextPageUrl)).toContain('q=rock+%26+roll');
    });

    it('answers 200 with one empty page when nothing matches', async () => {
        stub = stubDb(0, []);

        const res = await send(app, 'GET', query({ q: 'nothing', ...filters }));

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            data: [],
            pagination: {
                currentPage: 1,
                perPage: 0,
                totalItems: 0,
                totalPages: 0,
                prevPageUrl: null,
                nextPageUrl: null,
            },
        });
    });

    it('answers 400 limit_out_of_range for a limit above the filtered count', async () => {
        stub = stubDb(3);

        const res = await send(app, 'GET', query({ q: 'rock', limit: '4' }));

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual(problemBody(400, 'Limit cannot exceed 3.', 'limit_out_of_range'));
    });

    it.each([
        ['empty', ''],
        ['blank', '   '],
    ])('treats a %s q as no search', async (_, q) => {
        stub = stubDb(2, []);

        const res = await send(app, 'GET', query({ q }));

        expect(res.status).toBe(200);
        expect(render(call('$count')[1] as SQL).params).toEqual([]);
    });

    it('answers 400 validation_failed for a q over 100 characters or with six terms, before any query', async () => {
        stub = stubDb();

        for (const q of ['a'.repeat(101), 'a b c d e f']) {
            const res = await send(app, 'GET', query({ q }));
            const body = (await res.json()) as { code: string; errors: { field: string; in: string }[] };

            expect(res.status).toBe(400);
            expect(body.code).toBe('validation_failed');
            expect(body.errors).toMatchObject([{ field: '/q', in: 'query' }]);
        }

        expect(stub.calls).toEqual([]);
    });

    it('ignores a query parameter it does not know', async () => {
        stub = stubDb(2, []);

        expect((await send(app, 'GET', '/?sort=name&colour=red')).status).toBe(200);
    });
});

describe('the id filters', () => {
    it.each<[string, Hono, string[]]>([
        ['tracks', trackRoutes, ['album_id', 'genre_id', 'media_type_id', 'not_in_playlist_id']],
        ['albums', albumRoutes, ['artist_id']],
    ])(
        'on %s answer 400 validation_failed for a value that is not a positive whole number',
        async (_, routes, fields) => {
            stub = stubDb();
            const app = appFor(routes);

            for (const field of fields) {
                for (const value of ['abc', '0', '-1', '1.5']) {
                    const res = await send(app, 'GET', `/?${field}=${value}`);
                    const body = (await res.json()) as { code: string; errors: { field: string; in: string }[] };

                    expect(res.status).toBe(400);
                    expect(body.code).toBe('validation_failed');
                    expect(body.errors).toMatchObject([{ field: `/${field}`, in: 'query' }]);
                }
            }

            expect(stub.calls).toEqual([]);
        },
    );

    it('answer 200 with an empty page for an id that does not exist', async () => {
        stub = stubDb(0, []);

        const res = await send(appFor(trackRoutes), 'GET', '/?genre_id=99999');

        expect(res.status).toBe(200);
        expect(render(call('$count')[1] as SQL).params).toEqual([99999]);
    });

    it('answer 200, not 404, for a playlist that does not exist, and leave nothing out for it', async () => {
        stub = stubDb(3, []);

        const res = await send(appFor(trackRoutes), 'GET', '/?not_in_playlist_id=99999');
        const counted = render(call('$count')[1] as SQL);

        expect(res.status).toBe(200);
        expect(counted.sql).toContain('not exists (select 1 from "playlist_tracks"');
        expect(counted.params).toEqual([99999]);
        expect(stub.methods()).not.toContain('select');
    });
});

describe('GET / for tracks with not_in_playlist_id', () => {
    const app = appFor(trackRoutes);

    it('counts the tracks that remain, and the page links keep the playlist', async () => {
        stub = stubDb(25, []);

        const res = await send(app, 'GET', '/?not_in_playlist_id=7&genre_id=1&q=love&limit=10&page=2');
        const { pagination } = (await res.json()) as { pagination: Record<string, unknown> };

        expect(pagination).toMatchObject({ totalItems: 25, totalPages: 3 });
        expect(pagination.prevPageUrl).toBe('/?genre_id=1&limit=10&not_in_playlist_id=7&q=love&page=1');
        expect(pagination.nextPageUrl).toBe('/?genre_id=1&limit=10&not_in_playlist_id=7&q=love&page=3');
    });

    it('combines with the search and the other filters, in the count and the list', async () => {
        stub = stubDb(1, []);

        await send(app, 'GET', '/?not_in_playlist_id=7&genre_id=1&q=love');

        const counted = render(call('$count')[1] as SQL);

        expect(counted).toEqual(render((call('findMany')[0] as { where: SQL }).where));
        expect(counted.sql).toContain('"tracks"."genre_id" = $1 and not exists');
        expect(counted.sql).toContain('"tracks"."name" ilike');
        expect(counted.params).toEqual(expect.arrayContaining([1, 7, '%love%']));
    });
});
