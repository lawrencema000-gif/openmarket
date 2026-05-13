CREATE TABLE "distribution_channel_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distribution_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"share_token" text NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "distribution_channel_releases" ADD CONSTRAINT "distribution_channel_releases_channel_id_distribution_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."distribution_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_channel_releases" ADD CONSTRAINT "distribution_channel_releases_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_channels" ADD CONSTRAINT "distribution_channels_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_channels" ADD CONSTRAINT "distribution_channels_created_by_developers_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."developers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "distribution_channel_releases_idx" ON "distribution_channel_releases" USING btree ("channel_id","release_id");--> statement-breakpoint
CREATE UNIQUE INDEX "distribution_channels_token_idx" ON "distribution_channels" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "distribution_channels_app_idx" ON "distribution_channels" USING btree ("app_id","revoked_at");