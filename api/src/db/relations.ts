import { relations } from 'drizzle-orm/relations';
import {
    albums,
    artists,
    customers,
    employees,
    genres,
    invoice_lines,
    invoices,
    media_types,
    playlist_tracks,
    playlists,
    tracks,
} from './schema';

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
    customer: one(customers, {
        fields: [invoices.customer_id],
        references: [customers.id],
    }),
    invoice_lines: many(invoice_lines),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
    invoices: many(invoices),
    employee: one(employees, {
        fields: [customers.support_rep_id],
        references: [employees.id],
    }),
}));

export const invoice_linesRelations = relations(invoice_lines, ({ one }) => ({
    invoice: one(invoices, {
        fields: [invoice_lines.invoice_id],
        references: [invoices.id],
    }),
    track: one(tracks, {
        fields: [invoice_lines.track_id],
        references: [tracks.id],
    }),
}));

export const tracksRelations = relations(tracks, ({ one, many }) => ({
    invoice_lines: many(invoice_lines),
    album: one(albums, {
        fields: [tracks.album_id],
        references: [albums.id],
    }),
    genre: one(genres, {
        fields: [tracks.genre_id],
        references: [genres.id],
    }),
    media_type: one(media_types, {
        fields: [tracks.media_type_id],
        references: [media_types.id],
    }),
    playlist_tracks: many(playlist_tracks),
}));

export const albumsRelations = relations(albums, ({ one, many }) => ({
    tracks: many(tracks),
    artist: one(artists, {
        fields: [albums.artist_id],
        references: [artists.id],
    }),
}));

export const genresRelations = relations(genres, ({ many }) => ({
    tracks: many(tracks),
}));

export const media_typesRelations = relations(media_types, ({ many }) => ({
    tracks: many(tracks),
}));

export const artistsRelations = relations(artists, ({ many }) => ({
    albums: many(albums),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
    employee: one(employees, {
        fields: [employees.reports_to],
        references: [employees.id],
        relationName: 'employees_reports_to_employees_id',
    }),
    employees: many(employees, {
        relationName: 'employees_reports_to_employees_id',
    }),
    customers: many(customers),
}));

export const playlist_tracksRelations = relations(playlist_tracks, ({ one }) => ({
    playlist: one(playlists, {
        fields: [playlist_tracks.playlist_id],
        references: [playlists.id],
    }),
    track: one(tracks, {
        fields: [playlist_tracks.track_id],
        references: [tracks.id],
    }),
}));

export const playlistsRelations = relations(playlists, ({ many }) => ({
    playlist_tracks: many(playlist_tracks),
}));
