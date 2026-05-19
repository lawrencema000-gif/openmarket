CREATE TYPE "public"."promotion_status" AS ENUM('draft', 'pending_review', 'active', 'paused_budget', 'paused_policy', 'ended');--> statement-breakpoint
CREATE TABLE "promoted_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"developer_id" uuid NOT NULL,
	"bid_cents_per_click" integer NOT NULL,
	"daily_budget_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"target_countries" text[],
	"target_categories" text[],
	"status" "promotion_status" DEFAULT 'draft' NOT NULL,
	"policy_approved_at" timestamp with time zone,
	"policy_approved_by" uuid,
	"policy_rejection_reason" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_daily_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"day" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promoted_listings" ADD CONSTRAINT "promoted_listings_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promoted_listings" ADD CONSTRAINT "promoted_listings_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_daily_stats" ADD CONSTRAINT "promotion_daily_stats_promotion_id_promoted_listings_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promoted_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promoted_listings_status_idx" ON "promoted_listings" USING btree ("status","start_at");--> statement-breakpoint
CREATE INDEX "promoted_listings_app_idx" ON "promoted_listings" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_daily_stats_promo_day_idx" ON "promotion_daily_stats" USING btree ("promotion_id","day");