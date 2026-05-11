CREATE TABLE "app_statistics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"day" text NOT NULL,
	"total_installs" integer DEFAULT 0 NOT NULL,
	"active_installs" integer DEFAULT 0 NOT NULL,
	"new_installs_today" integer DEFAULT 0 NOT NULL,
	"uninstalls_today" integer DEFAULT 0 NOT NULL,
	"total_reviews" integer DEFAULT 0 NOT NULL,
	"new_reviews_today" integer DEFAULT 0 NOT NULL,
	"avg_rating" double precision DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_statistics_daily" ADD CONSTRAINT "app_statistics_daily_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_statistics_daily_unique_idx" ON "app_statistics_daily" USING btree ("app_id","day");--> statement-breakpoint
CREATE INDEX "app_statistics_daily_app_day_idx" ON "app_statistics_daily" USING btree ("app_id","day");