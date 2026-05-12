CREATE TYPE "public"."dmca_counter_notice_status" AS ENUM('filed', 'validated', 'rejected', 'restored', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."dmca_notice_status" AS ENUM('received', 'valid', 'invalid', 'processed', 'counter_noticed', 'restored', 'withdrawn');--> statement-breakpoint
CREATE TABLE "dmca_counter_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_id" uuid NOT NULL,
	"developer_id" uuid,
	"material_identification" text NOT NULL,
	"good_faith_mistake_statement" boolean NOT NULL,
	"jurisdiction_consent" boolean NOT NULL,
	"counter_party_name" text NOT NULL,
	"counter_party_email" text NOT NULL,
	"counter_party_address" text NOT NULL,
	"signature" text NOT NULL,
	"status" "dmca_counter_notice_status" DEFAULT 'filed' NOT NULL,
	"review_notes" text,
	"reviewed_at" timestamp with time zone,
	"restore_eligible_at" timestamp with time zone,
	"filed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dmca_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_number" text NOT NULL,
	"claimant_name" text NOT NULL,
	"claimant_email" text NOT NULL,
	"claimant_address" text NOT NULL,
	"claimant_organization" text,
	"copyrighted_work" text NOT NULL,
	"infringing_url" text NOT NULL,
	"app_id" uuid,
	"good_faith_statement" boolean NOT NULL,
	"accuracy_statement" boolean NOT NULL,
	"signature" text NOT NULL,
	"status" "dmca_notice_status" DEFAULT 'received' NOT NULL,
	"review_notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"counter_noticed_at" timestamp with time zone,
	"restored_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dmca_notices_notice_number_unique" UNIQUE("notice_number")
);
--> statement-breakpoint
ALTER TABLE "dmca_counter_notices" ADD CONSTRAINT "dmca_counter_notices_notice_id_dmca_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."dmca_notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dmca_counter_notices" ADD CONSTRAINT "dmca_counter_notices_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD CONSTRAINT "dmca_notices_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dmca_counter_notices_notice_idx" ON "dmca_counter_notices" USING btree ("notice_id");--> statement-breakpoint
CREATE INDEX "dmca_counter_notices_status_idx" ON "dmca_counter_notices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dmca_counter_notices_restore_eligible_idx" ON "dmca_counter_notices" USING btree ("restore_eligible_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dmca_notices_notice_number_idx" ON "dmca_notices" USING btree ("notice_number");--> statement-breakpoint
CREATE INDEX "dmca_notices_status_idx" ON "dmca_notices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dmca_notices_app_idx" ON "dmca_notices" USING btree ("app_id");