import {
    boolean,
    foreignKey,
    integer,
    numeric,
    pgTable,
    primaryKey,
    serial,
    text,
    timestamp,
    varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

export const sessions = pgTable('sessions', {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = pgTable('accounts', {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

export const verifications = pgTable('verifications', {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

export const invoices = pgTable(
    'invoices',
    {
        id: serial().primaryKey().notNull(),
        customer_id: integer().notNull(),
        invoice_date: timestamp({ mode: 'string' }).notNull(),
        billing_address: varchar({ length: 255 }),
        billing_city: varchar({ length: 255 }),
        billing_state: varchar({ length: 255 }),
        billing_country: varchar({ length: 255 }),
        billing_postal_code: varchar({ length: 255 }),
        total: numeric({ precision: 10, scale: 2 }).notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.customer_id],
            foreignColumns: [customers.id],
            name: 'invoice_customer_id_fkey',
        }),
    ],
);

export const invoice_lines = pgTable(
    'invoice_lines',
    {
        id: serial().primaryKey().notNull(),
        invoice_id: integer().notNull(),
        track_id: integer().notNull(),
        unit_price: numeric({ precision: 10, scale: 2 }).notNull(),
        quantity: integer().notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.invoice_id],
            foreignColumns: [invoices.id],
            name: 'invoice_line_invoice_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.track_id],
            foreignColumns: [tracks.id],
            name: 'invoice_line_track_id_fkey',
        }),
    ],
);

export const tracks = pgTable(
    'tracks',
    {
        id: serial().primaryKey().notNull(),
        name: varchar({ length: 200 }).notNull(),
        album_id: integer(),
        media_type_id: integer().notNull(),
        genre_id: integer(),
        composer: varchar({ length: 220 }),
        milliseconds: integer().notNull(),
        bytes: integer(),
        unit_price: numeric({ precision: 10, scale: 2 }).notNull(),
        // Set when the track is deleted through the API. The row stays, so invoice lines keep pointing at a real track.
        deleted_at: timestamp(),
    },
    (table) => [
        foreignKey({
            columns: [table.album_id],
            foreignColumns: [albums.id],
            name: 'track_album_id_fkey',
        }),
        foreignKey({
            columns: [table.genre_id],
            foreignColumns: [genres.id],
            name: 'track_genre_id_fkey',
        }),
        foreignKey({
            columns: [table.media_type_id],
            foreignColumns: [media_types.id],
            name: 'track_media_type_id_fkey',
        }),
    ],
);

export const artists = pgTable('artists', {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
});

export const albums = pgTable(
    'albums',
    {
        id: serial().primaryKey().notNull(),
        title: varchar({ length: 255 }).notNull(),
        artist_id: integer().notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.artist_id],
            foreignColumns: [artists.id],
            name: 'album_artist_id_fkey',
        }),
    ],
);

export const employees = pgTable(
    'employees',
    {
        id: serial().primaryKey().notNull(),
        first_name: varchar({ length: 255 }).notNull(),
        last_name: varchar({ length: 255 }).notNull(),
        title: varchar({ length: 255 }),
        reports_to: integer(),
        birth_date: timestamp({ mode: 'string' }),
        hire_date: timestamp({ mode: 'string' }),
        address: varchar({ length: 255 }),
        city: varchar({ length: 255 }),
        state: varchar({ length: 255 }),
        country: varchar({ length: 255 }),
        postal_code: varchar({ length: 255 }),
        phone: varchar({ length: 255 }),
        fax: varchar({ length: 255 }),
        email: varchar({ length: 255 }),
    },
    (table) => [
        foreignKey({
            columns: [table.reports_to],
            foreignColumns: [table.id],
            name: 'employee_reports_to_fkey',
        }),
    ],
);

export const customers = pgTable(
    'customers',
    {
        id: serial().primaryKey().notNull(),
        first_name: varchar({ length: 255 }).notNull(),
        last_name: varchar({ length: 255 }).notNull(),
        company: varchar({ length: 255 }),
        address: varchar({ length: 255 }),
        city: varchar({ length: 255 }),
        state: varchar({ length: 255 }),
        country: varchar({ length: 255 }),
        postal_code: varchar({ length: 255 }),
        phone: varchar({ length: 255 }),
        fax: varchar({ length: 255 }),
        email: varchar({ length: 255 }).notNull(),
        support_rep_id: integer(),
    },
    (table) => [
        foreignKey({
            columns: [table.support_rep_id],
            foreignColumns: [employees.id],
            name: 'customer_support_rep_id_fkey',
        }),
    ],
);

export const playlists = pgTable('playlists', {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
});

export const genres = pgTable('genres', {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
});

export const media_types = pgTable('media_types', {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
});

export const playlist_tracks = pgTable(
    'playlist_tracks',
    {
        playlist_id: integer().notNull(),
        track_id: integer().notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.playlist_id],
            foreignColumns: [playlists.id],
            name: 'playlist_track_playlist_id_fkey',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.track_id],
            foreignColumns: [tracks.id],
            name: 'playlist_track_track_id_fkey',
        }).onDelete('cascade'),
        primaryKey({ columns: [table.playlist_id, table.track_id], name: 'playlist_tracks_pkey' }),
    ],
);
