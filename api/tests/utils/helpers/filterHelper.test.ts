import { describe, expect, it } from 'bun:test';
import {
    albumsWhere,
    artistsWhere,
    genresWhere,
    mediaTypesWhere,
    playlistsWhere,
    tracksWhere,
} from '@/utils/helpers/filterHelper';
import { render } from '../../support/sql';

// These show the condition each route sends to the database. They cannot show
// what Postgres matches with it; that needs a real database.

describe('tracksWhere', () => {
    it('is only "not deleted" with no filters', () => {
        expect(render(tracksWhere({}))).toEqual({ sql: '"tracks"."deleted_at" is null', params: [] });
    });

    it('adds an exact match for each id filter, and leaves out the ones it is not given', () => {
        const { sql, params } = render(tracksWhere({ genre_id: 3, media_type_id: 1 }));

        expect(sql).toBe(
            '("tracks"."deleted_at" is null and "tracks"."genre_id" = $1 and "tracks"."media_type_id" = $2)',
        );
        expect(params).toEqual([3, 1]);
        expect(sql).not.toContain('album_id');
    });

    it('searches the track name or, through a subquery, the live album and artist', () => {
        const { sql, params } = render(tracksWhere({ q: 'queen' }));

        expect(sql).toContain('"tracks"."name" ilike $1');
        expect(sql).toContain('exists (select 1 from "albums" inner join "artists"');
        expect(sql).toContain('"albums"."id" = "tracks"."album_id"');
        expect(sql).toContain('"albums"."deleted_at" is null and "artists"."deleted_at" is null');
        expect(sql).toContain('"albums"."title" ilike $2 or "artists"."name" ilike $3');
        expect(params).toEqual(['%queen%', '%queen%', '%queen%']);
    });

    it('does not join the album, so a track with no album is still a candidate', () => {
        // The tracks table is not joined to; only the exists subquery is.
        expect(render(tracksWhere({ q: 'queen' })).sql).not.toMatch(/from "tracks"/);
        expect(render(tracksWhere({ q: 'queen' })).sql).not.toMatch(/join "albums" on "albums"."id" = "tracks"/);
    });

    it('needs every term to match, each in any field', () => {
        const { sql, params } = render(tracksWhere({ q: 'queen love' }));

        expect(sql.match(/"tracks"\."name" ilike/g)).toHaveLength(2);
        expect(params).toEqual(['%queen%', '%queen%', '%queen%', '%love%', '%love%', '%love%']);
    });

    it('escapes %, _ and \\ in a term', () => {
        expect(render(tracksWhere({ q: '100%_\\' })).params).toEqual(Array(3).fill('%100\\%\\_\\\\%'));
    });

    it('combines the search with the id filters with AND', () => {
        const { sql, params } = render(tracksWhere({ q: 'love', album_id: 2, genre_id: 3, media_type_id: 1 }));

        expect(sql.startsWith('("tracks"."deleted_at" is null and "tracks"."album_id" = $1')).toBe(true);
        expect(params.slice(0, 3)).toEqual([2, 3, 1]);
    });

    it('treats an empty search as no search', () => {
        expect(render(tracksWhere({ q: '' }))).toEqual(render(tracksWhere({})));
    });
});

describe('albumsWhere', () => {
    it('searches the title or, through a subquery, the live artist name', () => {
        const { sql, params } = render(albumsWhere({ q: 'rock' }));

        expect(sql).toContain('"albums"."title" ilike $1');
        expect(sql).toContain('exists (select 1 from "artists"');
        expect(sql).toContain('"artists"."id" = "albums"."artist_id" and "artists"."deleted_at" is null');
        expect(params).toEqual(['%rock%', '%rock%']);
    });

    it('matches artist_id exactly', () => {
        const { sql, params } = render(albumsWhere({ artist_id: 4 }));

        expect(sql).toBe('("albums"."deleted_at" is null and "albums"."artist_id" = $1)');
        expect(params).toEqual([4]);
    });
});

describe('the name lists', () => {
    it.each([
        ['artists', artistsWhere, 'artists'],
        ['genres', genresWhere, 'genres'],
        ['media types', mediaTypesWhere, 'media_types'],
    ])('%s search the name and skip deleted rows', (_, where, table) => {
        expect(render(where({ q: 'ro ck' }))).toEqual({
            sql: `("${table}"."deleted_at" is null and ("${table}"."name" ilike $1 and "${table}"."name" ilike $2))`,
            params: ['%ro%', '%ck%'],
        });
        expect(render(where({}))).toEqual({ sql: `"${table}"."deleted_at" is null`, params: [] });
    });

    it('playlists search the name, with no deleted_at to check', () => {
        expect(render(playlistsWhere({ q: 'road' }))).toEqual({
            sql: '"playlists"."name" ilike $1',
            params: ['%road%'],
        });
        expect(playlistsWhere({})).toBeUndefined();
    });
});
