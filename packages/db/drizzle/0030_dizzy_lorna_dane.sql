CREATE TYPE "public"."org_policy_mode" AS ENUM('allowlist_only', 'blocklist', 'trusted_publishers');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'approver', 'member');--> statement-breakpoint
CREATE TABLE "enterprise_cohort_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_cohort_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"self_serve" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_enrollment_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"cohort_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer,
	"uses_count" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_org_allowlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"pinned_by" uuid,
	"auto_approve" boolean DEFAULT true NOT NULL,
	"pinned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_org_blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" DEFAULT 'member' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"logo_url" text,
	"primary_color" text DEFAULT '#0F172A' NOT NULL,
	"support_email" text,
	"policy_mode" "org_policy_mode" DEFAULT 'allowlist_only' NOT NULL,
	"require_private_network" boolean DEFAULT false NOT NULL,
	"mdm_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enterprise_cohort_members" ADD CONSTRAINT "enterprise_cohort_members_cohort_id_enterprise_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."enterprise_cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_cohort_members" ADD CONSTRAINT "enterprise_cohort_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_cohort_pins" ADD CONSTRAINT "enterprise_cohort_pins_cohort_id_enterprise_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."enterprise_cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_cohort_pins" ADD CONSTRAINT "enterprise_cohort_pins_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_cohorts" ADD CONSTRAINT "enterprise_cohorts_org_id_enterprise_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."enterprise_orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_enrollment_tokens" ADD CONSTRAINT "enterprise_enrollment_tokens_org_id_enterprise_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."enterprise_orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_org_allowlist" ADD CONSTRAINT "enterprise_org_allowlist_org_id_enterprise_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."enterprise_orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_org_allowlist" ADD CONSTRAINT "enterprise_org_allowlist_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_org_allowlist" ADD CONSTRAINT "enterprise_org_allowlist_pinned_by_users_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_org_blocklist" ADD CONSTRAINT "enterprise_org_blocklist_org_id_enterprise_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."enterprise_orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_org_blocklist" ADD CONSTRAINT "enterprise_org_blocklist_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_org_members" ADD CONSTRAINT "enterprise_org_members_org_id_enterprise_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."enterprise_orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_org_members" ADD CONSTRAINT "enterprise_org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_cohort_members_pair_idx" ON "enterprise_cohort_members" USING btree ("cohort_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_cohort_pins_pair_idx" ON "enterprise_cohort_pins" USING btree ("cohort_id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_cohorts_org_name_idx" ON "enterprise_cohorts" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_enrollment_tokens_hash_idx" ON "enterprise_enrollment_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_org_allowlist_pair_idx" ON "enterprise_org_allowlist" USING btree ("org_id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_org_blocklist_pair_idx" ON "enterprise_org_blocklist" USING btree ("org_id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_org_members_pair_idx" ON "enterprise_org_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "enterprise_org_members_org_idx" ON "enterprise_org_members" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_orgs_slug_idx" ON "enterprise_orgs" USING btree ("slug");