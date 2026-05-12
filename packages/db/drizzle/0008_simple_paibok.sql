CREATE TABLE "data_safety_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"collects_data" boolean NOT NULL,
	"shares_data" boolean DEFAULT false NOT NULL,
	"data_encrypted_in_transit" boolean DEFAULT false NOT NULL,
	"data_deletion_request_url" text,
	"privacy_policy_url" text,
	"data_types" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"permission_discrepancies" jsonb,
	"taxonomy_version" text NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_safety_declarations" ADD CONSTRAINT "data_safety_declarations_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_safety_declarations_app_idx" ON "data_safety_declarations" USING btree ("app_id");