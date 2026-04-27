ALTER TABLE "scans" DROP CONSTRAINT "scans_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "templates" DROP CONSTRAINT "templates_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "is_rechecked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "has_active_scan" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferences" text;