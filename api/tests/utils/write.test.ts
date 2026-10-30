import { afterEach, describe, expect, it } from 'bun:test';
import db from '@/db';
import { artists } from '@/db/schema';
import { httpError, requireLiveParent, type Transaction } from '@/utils/write';
import { stubDb } from '../support/stubDb';

let stub: ReturnType<typeof stubDb>;

afterEach(() => stub.restore());

describe('requireLiveParent', () => {
    it('passes when the parent exists and is not deleted, locking it against a concurrent delete', async () => {
        stub = stubDb([{ id: 7 }]);

        await db.transaction((tx) => requireLiveParent(tx, artists, 7, 'artist_id', 'artist'));

        expect(stub.methods()).toEqual(['select', 'from', 'where', 'for']);
        expect(stub.calls.at(-1)).toEqual(['for', ['share']]);
    });

    it('answers 422, naming the field, when no live row matches', async () => {
        stub = stubDb([]);

        const error = await db
            .transaction((tx: Transaction) => requireLiveParent(tx, artists, 7, 'artist_id', 'artist'))
            .catch((caught) => caught);

        expect(error).toEqual(httpError(422, 'artist_id does not refer to an existing artist.'));
        expect(error.status).toBe(422);
    });
});
