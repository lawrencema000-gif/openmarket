CREATE TYPE "public"."payout_status" AS ENUM('pending', 'paid', 'failed', 'reversed');--> statement-breakpoint
CREATE TABLE "developer_payout_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"stripe_account_id" text NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"country_code" text,
	"default_currency" text,
	"tax_info_collected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"currency" text NOT NULL,
	"gross_cents" integer NOT NULL,
	"platform_fee_bps" integer NOT NULL,
	"net_cents" integer NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"stripe_transfer_id" text,
	"failure_reason" text,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "developer_payout_accounts" ADD CONSTRAINT "developer_payout_accounts_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "developer_payout_accounts_dev_idx" ON "developer_payout_accounts" USING btree ("developer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_payout_accounts_stripe_idx" ON "developer_payout_accounts" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE INDEX "payouts_developer_idx" ON "payouts" USING btree ("developer_id","period_from");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_period_idx" ON "payouts" USING btree ("developer_id","period_from","currency");--> statement-breakpoint
CREATE INDEX "payouts_stripe_idx" ON "payouts" USING btree ("stripe_transfer_id");