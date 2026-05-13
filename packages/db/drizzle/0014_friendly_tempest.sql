CREATE TABLE "pre_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text DEFAULT 'both' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unregistered_at" timestamp with time zone,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "pre_registration_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pre_registrations" ADD CONSTRAINT "pre_registrations_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_registrations" ADD CONSTRAINT "pre_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pre_registrations_app_user_idx" ON "pre_registrations" USING btree ("app_id","user_id");--> statement-breakpoint
CREATE INDEX "pre_registrations_app_active_idx" ON "pre_registrations" USING btree ("app_id","unregistered_at","notified_at");