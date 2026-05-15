CREATE TYPE "public"."purchase_status" AS ENUM('pending', 'completed', 'refunded', 'failed');--> statement-breakpoint
CREATE TABLE "app_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"country_at_purchase" text,
	"status" "purchase_status" DEFAULT 'pending' NOT NULL,
	"stripe_payment_intent_id" text,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"refund_reason" text
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "refund_window_hours" integer;--> statement-breakpoint
ALTER TABLE "app_pricing" ADD CONSTRAINT "app_pricing_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_pricing_app_country_idx" ON "app_pricing" USING btree ("app_id","country_code");--> statement-breakpoint
CREATE INDEX "purchases_user_idx" ON "purchases" USING btree ("user_id","purchased_at");--> statement-breakpoint
CREATE INDEX "purchases_app_idx" ON "purchases" USING btree ("app_id","purchased_at");--> statement-breakpoint
CREATE INDEX "purchases_stripe_idx" ON "purchases" USING btree ("stripe_payment_intent_id");