import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// The shared .env lives at the repo root, next to docker-compose.yml.
config({ path: '../.env' });

export default defineConfig({
    out: './drizzle',
    schema: './src/db/schema.ts',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DB_URL!,
    },
    introspect: {
        casing: 'preserve',
    },
});
