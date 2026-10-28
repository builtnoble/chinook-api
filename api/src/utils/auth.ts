import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import db from '@/db';
import { getAllowedOrigins } from '@/utils/helpers';

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    secret: process.env.BETTER_AUTH_SECRET || undefined,
    // The same origins the CORS middleware allows; the base URL is always trusted.
    trustedOrigins: () => getAllowedOrigins(),
    plugins: [bearer()],
    emailAndPassword: {
        enabled: true,
    },
    database: drizzleAdapter(db, {
        provider: 'pg',
        usePlural: true,
    }),
});
