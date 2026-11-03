import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, bearer } from 'better-auth/plugins';
import db from '@/db';
import { getAllowedOrigins, getBaseUrl } from '@/utils/helpers/envHelper';

export const auth = betterAuth({
    baseURL: getBaseUrl(),
    secret: process.env.BETTER_AUTH_SECRET || undefined,
    // The same origins the CORS middleware allows; the base URL is always
    // trusted.
    trustedOrigins: () => getAllowedOrigins(),
    plugins: [bearer(), admin()],
    emailAndPassword: {
        enabled: true,
    },
    database: drizzleAdapter(db, {
        provider: 'pg',
        usePlural: true,
    }),
});
