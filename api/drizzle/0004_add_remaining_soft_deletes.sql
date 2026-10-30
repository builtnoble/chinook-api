-- Soft delete for artists, albums, genres and media types, like tracks in 0003: the API sets deleted_at instead of
-- removing the row. chinook-postgres 1.2 and later create the columns themselves, so this only changes databases made
-- from 1.0 or 1.1. IF NOT EXISTS makes it a no-op everywhere else.
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "genres" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "media_types" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
