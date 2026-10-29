-- Soft delete for tracks: the API sets deleted_at instead of removing the row, so invoice lines keep a real track.
-- chinook-postgres 1.1 and later create the column themselves, so this only changes databases made from 1.0. IF NOT
-- EXISTS makes it a no-op everywhere else.
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
