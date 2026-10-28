ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_line_invoice_id_fkey";
--> statement-breakpoint
ALTER TABLE "playlist_tracks" DROP CONSTRAINT "playlist_track_playlist_id_fkey";
--> statement-breakpoint
ALTER TABLE "playlist_tracks" DROP CONSTRAINT "playlist_track_track_id_fkey";
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_line_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_track_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_track_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;