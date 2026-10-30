ALTER TABLE "albums" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "genres" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "media_types" ADD COLUMN "deleted_at" timestamp;