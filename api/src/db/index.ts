import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as authRelations from './authRelations';
import * as authSchema from './authSchema';
import * as chinookRelations from './chinookRelations';
import * as chinookSchema from './chinookSchema';

const pool = new Pool({
    connectionString: process.env.DB_URL,
});

const db = drizzle({
    client: pool,
    schema: { ...authSchema, ...authRelations, ...chinookSchema, ...chinookRelations },
    casing: 'snake_case',
});

export default db;
