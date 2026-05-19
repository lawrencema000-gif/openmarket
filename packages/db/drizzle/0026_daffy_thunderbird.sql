CREATE TABLE "app_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"country_at_purchase" text,
	"status" "iap_subscription_status" NOT NULL,
	"stripe_subscription_id" text,
	"stripe_checkout_session_id" text,
	"interval" text NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"trial_days" integer,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "subscription_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "subscription_interval" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "subscription_interval_count" integer;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "subscription_trial_days" integer;--> statement-breakpoint
ALTER TABLE "app_subscriptions" ADD CONSTRAINT "app_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_subscriptions" ADD CONSTRAINT "app_subscriptions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_subscriptions_user_app_idx" ON "app_subscriptions" USING btree ("user_id","app_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "app_subscriptions_stripe_sub_idx" ON "app_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "app_subscriptions_session_idx" ON "app_subscriptions" USING btree ("stripe_checkout_session_id");