ALTER TABLE "developers" ADD COLUMN "platform_plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "threshold_crossed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "platform_subscription_id" text;