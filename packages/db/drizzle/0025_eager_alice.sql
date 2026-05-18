CREATE TYPE "public"."iap_product_type" AS ENUM('consumable', 'non_consumable', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."iap_subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused');--> statement-breakpoint
CREATE TABLE "app_iap_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"type" "iap_product_type" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subscription_interval" text,
	"subscription_interval_count" integer,
	"trial_days" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iap_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iap_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"country_at_purchase" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_subscription_id" text,
	"subscription_status" "iap_subscription_status",
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"refund_reason" text
);
--> statement-breakpoint
ALTER TABLE "app_iap_products" ADD CONSTRAINT "app_iap_products_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iap_pricing" ADD CONSTRAINT "iap_pricing_product_id_app_iap_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."app_iap_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iap_purchases" ADD CONSTRAINT "iap_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iap_purchases" ADD CONSTRAINT "iap_purchases_product_id_app_iap_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."app_iap_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iap_purchases" ADD CONSTRAINT "iap_purchases_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_iap_products_app_sku_idx" ON "app_iap_products" USING btree ("app_id","sku");--> statement-breakpoint
CREATE INDEX "app_iap_products_app_idx" ON "app_iap_products" USING btree ("app_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "iap_pricing_product_country_idx" ON "iap_pricing" USING btree ("product_id","country_code");--> statement-breakpoint
CREATE INDEX "iap_purchases_user_idx" ON "iap_purchases" USING btree ("user_id","purchased_at");--> statement-breakpoint
CREATE INDEX "iap_purchases_product_idx" ON "iap_purchases" USING btree ("product_id","purchased_at");--> statement-breakpoint
CREATE INDEX "iap_purchases_session_idx" ON "iap_purchases" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "iap_purchases_subscription_idx" ON "iap_purchases" USING btree ("stripe_subscription_id");