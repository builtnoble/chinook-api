import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, bearer } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import db from '@/db';
import { users } from '@/db/schema';
import { getAdminEmails, getAllowedOrigins, getBaseUrl, isAdminEmail } from '@/utils/helpers';

export const auth = betterAuth({
    baseURL: getBaseUrl(),
    secret: process.env.BETTER_AUTH_SECRET || undefined,
    // The same origins the CORS middleware allows; the base URL is always trusted.
    trustedOrigins: () => getAllowedOrigins(),
    plugins: [bearer(), admin()],
    emailAndPassword: {
        enabled: true,
    },
    database: drizzleAdapter(db, {
        provider: 'pg',
        usePlural: true,
    }),
    // Accounts whose email is in ADMIN_EMAILS get the admin role: at sign-up, and at sign-in for accounts that
    // existed before the address was listed. The role is never taken away when an address is removed.
    databaseHooks: {
        user: {
            create: {
                before: async (user) => ({
                    data: isAdminEmail(user.email) ? { ...user, role: 'admin' } : user,
                }),
            },
        },
        session: {
            create: {
                before: async (session) => {
                    if (!getAdminEmails().length) {
                        return;
                    }

                    const user = await db.query.users.findFirst({
                        columns: { id: true, email: true, role: true },
                        where: eq(users.id, session.userId),
                    });

                    if (user && user.role !== 'admin' && isAdminEmail(user.email)) {
                        await db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id));
                    }
                },
            },
        },
    },
});
