/// <reference types="bun" />
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import api from '@/api';
import { auth } from '@/utils/auth';

const spies: { mockRestore: () => void }[] = [];

afterEach(() => {
    for (const spy of spies.splice(0)) {
        spy.mockRestore();
    }
});

const signedInAs = (role: string | null) => {
    const session = role === null ? null : { user: { id: 'u1', role }, session: { id: 's1' } };

    spies.push(spyOn(auth.api, 'getSession').mockResolvedValue(session as never));
};

// Nothing is routed at this path, so a request that passes the guards ends in 404.
const post = () => api.request('/api/unrouted', { method: 'POST' });

describe('write authorization', () => {
    it('answers a write with no session with 401, before the role is checked', async () => {
        signedInAs(null);

        expect((await post()).status).toBe(401);
    });

    it('answers a write from a signed-in non-admin with 403', async () => {
        signedInAs('user');

        expect((await post()).status).toBe(403);
    });

    it('lets a write from an admin past the role check', async () => {
        signedInAs('admin');

        expect((await post()).status).toBe(404);
    });
});

describe('cross-site writes', () => {
    it('rejects a cookie write from an unlisted origin even for an admin', async () => {
        signedInAs('admin');

        const res = await api.request('/api/unrouted', {
            method: 'POST',
            headers: { Cookie: 'better-auth.session_token=abc', Origin: 'http://evil.test' },
        });

        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'The request comes from an origin that is not allowed.' });
    });
});
