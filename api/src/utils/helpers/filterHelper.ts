import { and, eq, exists, or, type SQL, sql } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { albums, artists, genres, media_types, playlists, tracks } from '@/db/chinookSchema';
import { containing, everyTerm } from '@/utils/helpers/searchHelper';
import { notDeleted } from '@/utils/helpers/softDeleteHelper';
import type {
    AlbumQuery,
    ArtistQuery,
    GenreQuery,
    MediaTypeQuery,
    PlaylistQuery,
    TrackQuery,
} from '@/utils/schema/requestSchema';

// The subqueries below are built without a connection, so a condition only
// describes a query.
const qb = new QueryBuilder();

// The `where` of each list route. A route builds it once from its validated
// query and uses it for both the count and the list, so the two cannot drift.
// Deleted rows never match, and the conditions combine with AND. A filter that
// is not in the query adds no condition.

const idIs = (column: Parameters<typeof eq>[0], id?: number): SQL | undefined =>
    id === undefined ? undefined : eq(column, id);

export const artistsWhere = ({ q }: ArtistQuery) =>
    and(
        notDeleted(artists),
        everyTerm(q, (term) => containing(artists.name, term)),
    );

// An exists, not a join, so an album is never repeated. A deleted artist is not
// matched through.
const artistNamed = (term: string) =>
    exists(
        qb
            .select({ one: sql`1` })
            .from(artists)
            .where(and(eq(artists.id, albums.artist_id), notDeleted(artists), containing(artists.name, term))),
    );

export const albumsWhere = ({ q, artist_id }: AlbumQuery) =>
    and(
        notDeleted(albums),
        idIs(albums.artist_id, artist_id),
        everyTerm(q, (term) => or(containing(albums.title, term), artistNamed(term))),
    );

export const genresWhere = ({ q }: GenreQuery) =>
    and(
        notDeleted(genres),
        everyTerm(q, (term) => containing(genres.name, term)),
    );

export const mediaTypesWhere = ({ q }: MediaTypeQuery) =>
    and(
        notDeleted(media_types),
        everyTerm(q, (term) => containing(media_types.name, term)),
    );

// Playlists are deleted for good, so there is no deleted_at to check.
export const playlistsWhere = ({ q }: PlaylistQuery) => everyTerm(q, (term) => containing(playlists.name, term));

// A track with no album has nothing to search through, so it can only match on
// its own name. The album and its artist must both be live to be matched
// through.
const albumOrArtistNamed = (term: string) =>
    exists(
        qb
            .select({ one: sql`1` })
            .from(albums)
            .innerJoin(artists, eq(artists.id, albums.artist_id))
            .where(
                and(
                    eq(albums.id, tracks.album_id),
                    notDeleted(albums),
                    notDeleted(artists),
                    or(containing(albums.title, term), containing(artists.name, term)),
                ),
            ),
    );

export const tracksWhere = ({ q, album_id, genre_id, media_type_id }: TrackQuery) =>
    and(
        notDeleted(tracks),
        idIs(tracks.album_id, album_id),
        idIs(tracks.genre_id, genre_id),
        idIs(tracks.media_type_id, media_type_id),
        everyTerm(q, (term) => or(containing(tracks.name, term), albumOrArtistNamed(term))),
    );
