import { describe, expect, it } from 'bun:test';
import { trackCreateSchema, trackUpdateSchema } from '@/utils/schema/resources/trackSchema';

const track = { name: 'Intro', media_type_id: 1, milliseconds: 1000, unit_price: '0.99' };

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

describe('trackUpdateSchema', () => {
    it('takes any one field, but still checks its value', () => {
        expect(trackUpdateSchema.safeParse({ unit_price: '1.29' }).success).toBe(true);
        expect(trackUpdateSchema.safeParse({ unit_price: 'free' }).success).toBe(false);
    });
});
