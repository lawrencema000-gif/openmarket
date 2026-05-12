CREATE TYPE "public"."crash_group_status" AS ENUM('open', 'ignored', 'resolved');--> statement-breakpoint
CREATE TABLE "crash_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"release_id" uuid,
	"app_version_code" integer,
	"app_version_name" text,
	"device_model" text,
	"os_version" text,
	"device_fingerprint" text,
	"stack_trace" text NOT NULL,
	"context" jsonb,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crash_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"exception_type" text NOT NULL,
	"exception_message" text,
	"stack_trace" text NOT NULL,
	"status" "crash_group_status" DEFAULT 'open' NOT NULL,
	"resolved_at_release_id" uuid,
	"occurrence_count" integer DEFAULT 0 NOT NULL,
	"affected_user_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crash_events" ADD CONSTRAINT "crash_events_group_id_crash_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."crash_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crash_events" ADD CONSTRAINT "crash_events_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crash_events" ADD CONSTRAINT "crash_events_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crash_groups" ADD CONSTRAINT "crash_groups_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crash_groups" ADD CONSTRAINT "crash_groups_resolved_at_release_id_releases_id_fk" FOREIGN KEY ("resolved_at_release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crash_events_group_idx" ON "crash_events" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "crash_events_app_idx" ON "crash_events" USING btree ("app_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crash_groups_app_fingerprint_idx" ON "crash_groups" USING btree ("app_id","fingerprint");--> statement-breakpoint
CREATE INDEX "crash_groups_app_status_idx" ON "crash_groups" USING btree ("app_id","status","last_seen_at");