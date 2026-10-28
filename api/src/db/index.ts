import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as relations from './relations';
import * as schema from './schema';

const pool = new Pool({
    connectionString: process.env.DB_URL,
});

const db = drizzle({
    client: pool,
    schema: { ...schema, ...relations },
    casing: 'snake_case',
});

export default db;
