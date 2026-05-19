CREATE TYPE "public"."affiliate_conversion_status" AS ENUM('pending', 'approved', 'reversed', 'paid');--> statement-breakpoint
CREATE TYPE "public"."affiliate_status" AS ENUM('active', 'paused', 'banned');--> statement-breakpoint
CREATE TABLE "affiliate_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"referral_code" text NOT NULL,
	"status" "affiliate_status" DEFAULT 'active' NOT NULL,
	"handle" text,
	"payout_email" text,
	"banned_at" timestamp with time zone,
	"ban_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"referral_code" text NOT NULL,
	"device_fingerprint_hash" text,
	"country_code" text,
	"surface" text,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"click_id" uuid,
	"install_event_id" uuid,
	"device_fingerprint_hash" text,
	"commission_cents" integer NOT NULL,
	"platform_fee_bps" integer DEFAULT 3000 NOT NULL,
	"currency" text NOT NULL,
	"status" "affiliate_conversion_status" DEFAULT 'pending' NOT NULL,
	"hold_until" timestamp with time zone,
	"payout_id" uuid,
	"reversal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_affiliate_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"commission_bps" integer,
	"flat_commission_cents" integer,
	"attribution_window_days" integer DEFAULT 30 NOT NULL,
	"daily_cap_per_affiliate_cents" integer,
	"enabled" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate_accounts" ADD CONSTRAINT "affiliate_accounts_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_affiliate_id_affiliate_accounts_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_affiliate_id_affiliate_accounts_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_affiliate_programs" ADD CONSTRAINT "app_affiliate_programs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_accounts_developer_idx" ON "affiliate_accounts" USING btree ("developer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_accounts_code_idx" ON "affiliate_accounts" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "affiliate_clicks_app_idx" ON "affiliate_clicks" USING btree ("app_id","clicked_at");--> statement-breakpoint
CREATE INDEX "affiliate_clicks_device_idx" ON "affiliate_clicks" USING btree ("device_fingerprint_hash");--> statement-breakpoint
CREATE INDEX "affiliate_conversions_affiliate_idx" ON "affiliate_conversions" USING btree ("affiliate_id","status");--> statement-breakpoint
CREATE INDEX "affiliate_conversions_app_idx" ON "affiliate_conversions" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_conversions_install_idx" ON "affiliate_conversions" USING btree ("install_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_affiliate_programs_app_idx" ON "app_affiliate_programs" USING btree ("app_id");