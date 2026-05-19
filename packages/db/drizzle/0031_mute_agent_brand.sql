CREATE TYPE "public"."federation_peer_status" AS ENUM('pending', 'active', 'suspended', 'removed');--> statement-breakpoint
CREATE TABLE "federated_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"peer_id" uuid NOT NULL,
	"remote_app_id" text NOT NULL,
	"package_name" text NOT NULL,
	"title" text NOT NULL,
	"short_description" text,
	"icon_url" text,
	"category" text,
	"signing_key_fingerprint" text,
	"version_code" integer NOT NULL,
	"version_name" text NOT NULL,
	"apk_sha256" text NOT NULL,
	"download_url" text NOT NULL,
	"flags" jsonb,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"peer_id" uuid NOT NULL,
	"remote_app_id" text,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" text NOT NULL,
	"public_key" text NOT NULL,
	"private_key_encrypted" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "federation_peers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin" text NOT NULL,
	"display_name" text NOT NULL,
	"public_key" text NOT NULL,
	"status" "federation_peer_status" DEFAULT 'pending' NOT NULL,
	"trust_score" integer DEFAULT 50 NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_fetch_error" text,
	"last_fetch_error_at" timestamp with time zone,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "federated_apps" ADD CONSTRAINT "federated_apps_peer_id_federation_peers_id_fk" FOREIGN KEY ("peer_id") REFERENCES "public"."federation_peers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "federation_blocklist" ADD CONSTRAINT "federation_blocklist_peer_id_federation_peers_id_fk" FOREIGN KEY ("peer_id") REFERENCES "public"."federation_peers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "federated_apps_peer_remote_idx" ON "federated_apps" USING btree ("peer_id","remote_app_id");--> statement-breakpoint
CREATE INDEX "federated_apps_package_idx" ON "federated_apps" USING btree ("package_name");--> statement-breakpoint
CREATE UNIQUE INDEX "federation_blocklist_peer_app_idx" ON "federation_blocklist" USING btree ("peer_id","remote_app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "federation_keys_key_id_idx" ON "federation_keys" USING btree ("key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "federation_peers_origin_idx" ON "federation_peers" USING btree ("origin");