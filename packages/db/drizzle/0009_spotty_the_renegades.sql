CREATE TABLE "beta_testers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reverted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "beta_track_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "beta_testers" ADD CONSTRAINT "beta_testers_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_testers" ADD CONSTRAINT "beta_testers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "beta_testers_app_user_idx" ON "beta_testers" USING btree ("app_id","user_id");--> statement-breakpoint
CREATE INDEX "beta_testers_app_active_idx" ON "beta_testers" USING btree ("app_id","reverted_at");