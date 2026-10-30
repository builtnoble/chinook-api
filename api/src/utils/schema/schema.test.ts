/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import {
    albumCreateSchema,
    albumUpdateSchema,
    artistCreateSchema,
    artistUpdateSchema,
    genreCreateSchema,
    mediaTypeCreateSchema,
    playlistCreateSchema,
    playlistTrackCreateSchema,
    trackCreateSchema,
    trackUpdateSchema,
} from '@/utils/schema';

const track = { name: 'Intro', media_type_id: 1, milliseconds: 1000, unit_price: '0.99' };

describe('create schemas', () => {
    it('accept the fields of the table and nothing else', () => {
        expect(artistCreateSchema.safeParse({ name: 'AC/DC' }).success).toBe(true);
        expect(albumCreateSchema.safeParse({ title: 'Back in Black', artist_id: 1 }).success).toBe(true);
        expect(genreCreateSchema.safeParse({ name: 'Rock' }).success).toBe(true);
        expect(mediaTypeCreateSchema.safeParse({ name: 'MPEG audio file' }).success).toBe(true);
        expect(playlistCreateSchema.safeParse({ name: 'Music' }).success).toBe(true);
    });

    it.each([
        ['id', { id: 5 }],
        ['deleted_at', { deleted_at: '2026-01-01T00:00:00Z' }],
        ['an unknown key', { colour: 'red' }],
    ])('reject %s', (_, extra) => {
        expect(artistCreateSchema.safeParse({ name: 'AC/DC', ...extra }).success).toBe(false);
    });

    it('reject an empty or missing name, and one longer than the column', () => {
        expect(artistCreateSchema.safeParse({ name: '' }).success).toBe(false);
        expect(artistCreateSchema.safeParse({}).success).toBe(false);
        expect(artistCreateSchema.safeParse({ name: 'x'.repeat(256) }).success).toBe(false);
    });

    it('require the parent id of an album, as an integer', () => {
        expect(albumCreateSchema.safeParse({ title: 'Back in Black' }).success).toBe(false);
        expect(albumCreateSchema.safeParse({ title: 'Back in Black', artist_id: 1.5 }).success).toBe(false);
        expect(albumCreateSchema.safeParse({ title: 'Back in Black', artist_id: '1' }).success).toBe(false);
    });
});

describe('trackCreateSchema', () => {
    it('needs a name, a media type, a length and a price, and leaves the album and genre optional', () => {
        expect(trackCreateSchema.safeParse(track).success).toBe(true);
        expect(trackCreateSchema.safeParse({ ...track, album_id: null, genre_id: null, composer: null }).success).toBe(
            true,
        );
        expect(trackCreateSchema.safeParse({ name: 'Intro' }).success).toBe(false);
    });

    it.each(['0.99', '10', '12345678.5', '0'])('accepts the price %s', (unit_price) => {
        expect(trackCreateSchema.safeParse({ ...track, unit_price }).success).toBe(true);
    });

    it.each(['abc', '-1', '1.999', '123456789', '', '1e3'])(
        'rejects the price %j, which the column cannot store',
        (unit_price) => {
            expect(trackCreateSchema.safeParse({ ...track, unit_price }).success).toBe(false);
        },
    );

    it('rejects a length of zero or less and a negative size', () => {
        expect(trackCreateSchema.safeParse({ ...track, milliseconds: 0 }).success).toBe(false);
        expect(trackCreateSchema.safeParse({ ...track, bytes: -1 }).success).toBe(false);
    });
});

describe('update schemas', () => {
    it('take any one field', () => {
        expect(artistUpdateSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
        expect(albumUpdateSchema.safeParse({ artist_id: 2 }).success).toBe(true);
        expect(trackUpdateSchema.safeParse({ unit_price: '1.29' }).success).toBe(true);
    });

    it('reject an empty body, which would update nothing', () => {
        const result = artistUpdateSchema.safeParse({});

        expect(result.success).toBe(false);
        expect(JSON.stringify(result.error?.issues)).toContain('At least one field is required.');
    });

    it('still reject an unknown key, an id and a value that is not valid', () => {
        expect(artistUpdateSchema.safeParse({ colour: 'red' }).success).toBe(false);
        expect(artistUpdateSchema.safeParse({ id: 5 }).success).toBe(false);
        expect(trackUpdateSchema.safeParse({ unit_price: 'free' }).success).toBe(false);
    });
});

describe('playlistTrackCreateSchema', () => {
    it('takes only the track id', () => {
        expect(playlistTrackCreateSchema.safeParse({ track_id: 5 }).success).toBe(true);
        expect(playlistTrackCreateSchema.safeParse({ track_id: 5, playlist_id: 1 }).success).toBe(false);
        expect(playlistTrackCreateSchema.safeParse({}).success).toBe(false);
    });
});
