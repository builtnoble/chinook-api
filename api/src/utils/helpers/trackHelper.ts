import { withoutDeletedAt } from '@/utils/helpers/softDeleteHelper';

// What a track is read with, wherever it is returned: its album (and the
// album's artist), genre and media type, none of them with `deleted_at`. Pass
// it as a relational query's `with`.
export const withTrackRelations = {
    album: {
        columns: withoutDeletedAt,
        with: {
            artist: { columns: withoutDeletedAt },
        },
    },
    genre: { columns: withoutDeletedAt },
    media_type: { columns: withoutDeletedAt },
} as const;
