/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import db from '@/db';
import { auth } from '@/utils/auth';

const hooks = auth.options.databaseHooks;
const original = process.env.ADMIN_EMAILS;

const spies: { mockRestore: () => void }[] = [];

beforeEach(() => {
    process.env.ADMIN_EMAILS = 'ada@example.test';
});

afterEach(() => {
    for (const spy of spies.splice(0)) {
        spy.mockRestore();
    }

    if (original === undefined) {
        delete process.env.ADMIN_EMAILS;
    } else {
        process.env.ADMIN_EMAILS = original;
    }
});

const newUser = (email: string) => ({ name: 'Test', email, emailVerified: false });

describe('promotion at sign-up', () => {
    it('gives the admin role to a listed email, without regard to case', async () => {
        const result = await hooks?.user?.create?.before?.(newUser('ADA@Example.test') as never);

        expect(result).toEqual({ data: expect.objectContaining({ role: 'admin' }) });
    });

    it('leaves any other email without a role, so the plugin default applies', async () => {
        const result = await hooks?.user?.create?.before?.(newUser('someone@example.test') as never);

        expect(result).toEqual({ data: expect.objectContaining(newUser('someone@example.test')) });
        expect((result as { data: { role?: string } }).data.role).toBeUndefined();
    });
});

describe('promotion at sign-in', () => {
    const stub = (user: { id: string; email: string; role: string | null } | undefined) => {
        const find = spyOn(db.query.users, 'findFirst').mockResolvedValue(user as never);
        const where = (async () => undefined) as never;
        const update = spyOn(db, 'update').mockReturnValue({ set: () => ({ where }) } as never);

        spies.push(find, update);

        return { find, update };
    };

    const signIn = () => hooks?.session?.create?.before?.({ userId: 'u1' } as never);

    it('promotes an existing account whose email is now listed', async () => {
        const { update } = stub({ id: 'u1', email: 'ada@example.test', role: 'user' });

        await signIn();

        expect(update).toHaveBeenCalledTimes(1);
    });

    it('does nothing for an account that is already an admin', async () => {
        const { update } = stub({ id: 'u1', email: 'ada@example.test', role: 'admin' });

        await signIn();

        expect(update).not.toHaveBeenCalled();
    });

    it('does nothing for an account whose email is not listed', async () => {
        const { update } = stub({ id: 'u1', email: 'someone@example.test', role: 'user' });

        await signIn();

        expect(update).not.toHaveBeenCalled();
    });

    it('does not even look the account up when ADMIN_EMAILS is empty', async () => {
        delete process.env.ADMIN_EMAILS;
        const { find, update } = stub({ id: 'u1', email: 'ada@example.test', role: 'user' });

        await signIn();

        expect(find).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });
});
