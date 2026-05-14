CREATE TYPE "public"."listing_experiment_status" AS ENUM('draft', 'running', 'concluded');--> statement-breakpoint
CREATE TABLE "listing_experiment_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_control" boolean DEFAULT false NOT NULL,
	"traffic_weight" integer DEFAULT 50 NOT NULL,
	"title" text,
	"short_description" text,
	"full_description" text,
	"icon_url" text,
	"screenshots" text[],
	"views_count" integer DEFAULT 0 NOT NULL,
	"installs_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hypothesis" text,
	"status" "listing_experiment_status" DEFAULT 'draft' NOT NULL,
	"winner_variant_id" uuid,
	"created_by" uuid,
	"started_at" timestamp with time zone,
	"concluded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_experiment_variants" ADD CONSTRAINT "listing_experiment_variants_experiment_id_listing_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."listing_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_experiments" ADD CONSTRAINT "listing_experiments_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_experiments" ADD CONSTRAINT "listing_experiments_created_by_developers_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."developers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_experiment_variants_exp_idx" ON "listing_experiment_variants" USING btree ("experiment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_experiment_variants_exp_label_idx" ON "listing_experiment_variants" USING btree ("experiment_id","label");--> statement-breakpoint
CREATE INDEX "listing_experiments_app_status_idx" ON "listing_experiments" USING btree ("app_id","status");