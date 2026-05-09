CREATE TYPE "public"."algorithm" AS ENUM('RSA', 'EC', 'DSA');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('id_document', 'domain_verification', 'play_console_screenshot', 'signed_apk_challenge');--> statement-breakpoint
CREATE TYPE "public"."identity_type" AS ENUM('email', 'domain', 'government_id', 'play_console', 'android_dev_console');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."trust_level" AS ENUM('experimental', 'verified', 'audited', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."artifact_type" AS ENUM('apk', 'aab');--> statement-breakpoint
CREATE TYPE "public"."content_rating" AS ENUM('everyone', 'teen', 'mature');--> statement-breakpoint
CREATE TYPE "public"."release_channel" AS ENUM('stable', 'beta', 'canary');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('draft', 'scanning', 'review', 'staged_rollout', 'published', 'paused', 'rolled_back', 'delisted');--> statement-breakpoint
CREATE TYPE "public"."trust_tier" AS ENUM('standard', 'enhanced', 'experimental');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'uploaded', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."protection_level" AS ENUM('normal', 'dangerous', 'signature', 'privileged');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('pending', 'running', 'passed', 'failed', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."scan_type" AS ENUM('static', 'dynamic', 'diff', 'identity');--> statement-breakpoint
CREATE TYPE "public"."sdk_category" AS ENUM('ads', 'analytics', 'social', 'payment', 'security', 'other');--> statement-breakpoint
CREATE TYPE "public"."install_source" AS ENUM('store_app', 'web', 'direct');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'investigating', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_target_type" AS ENUM('app', 'release', 'developer', 'review');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('malware', 'scam', 'impersonation', 'illegal', 'spam', 'broken', 'other');--> statement-breakpoint
CREATE TYPE "public"."appeal_status" AS ENUM('none', 'pending', 'upheld', 'overturned');--> statement-breakpoint
CREATE TYPE "public"."moderation_action" AS ENUM('warn', 'delist_release', 'freeze_updates', 'suspend_developer', 'reinstate');--> statement-breakpoint
CREATE TYPE "public"."moderation_target_type" AS ENUM('app', 'release', 'developer');--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"identity_type" "identity_type" NOT NULL,
	"identity_value" text NOT NULL,
	"verification_status" "verification_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_verification_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"evidence_type" "evidence_type" NOT NULL,
	"file_url" text NOT NULL,
	"notes" text,
	"reviewed_by" uuid,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"legal_entity_name" text,
	"country" text,
	"support_email" text,
	"support_url" text,
	"privacy_policy_url" text,
	"trust_level" "trust_level" DEFAULT 'experimental' NOT NULL,
	"suspension_reason" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"auth_provider" text,
	"auth_provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "developers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "signing_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"fingerprint_sha256" text NOT NULL,
	"algorithm" "algorithm" NOT NULL,
	"certificate_pem" text,
	"key_size" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"title" text NOT NULL,
	"short_description" text NOT NULL,
	"full_description" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"screenshots" text[],
	"icon_url" text NOT NULL,
	"feature_graphic_url" text,
	"privacy_policy_url" text,
	"website_url" text,
	"source_code_url" text,
	"is_experimental" boolean DEFAULT false NOT NULL,
	"contains_ads" boolean DEFAULT false NOT NULL,
	"contains_iap" boolean DEFAULT false NOT NULL,
	"content_rating" "content_rating",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_name" text NOT NULL,
	"developer_id" uuid NOT NULL,
	"current_listing_id" uuid,
	"trust_tier" "trust_tier" DEFAULT 'standard' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_delisted" boolean DEFAULT false NOT NULL,
	"delist_reason" text,
	"review_freeze" boolean DEFAULT false NOT NULL,
	"anti_features" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apps_package_name_unique" UNIQUE("package_name")
);
--> statement-breakpoint
CREATE TABLE "artifact_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"min_sdk" integer NOT NULL,
	"target_sdk" integer NOT NULL,
	"abis" text[],
	"native_libs" text[],
	"icon_hash" text,
	"app_label" text NOT NULL,
	"is_debug_build" boolean DEFAULT false NOT NULL,
	"signing_key_fingerprint" text NOT NULL,
	"signing_scheme_versions" integer[],
	"components" jsonb,
	"exported_components" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"artifact_type" "artifact_type" DEFAULT 'apk' NOT NULL,
	"storage_bucket" text,
	"storage_key" text,
	"file_url" text NOT NULL,
	"file_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"upload_status" "upload_status" DEFAULT 'pending' NOT NULL,
	"uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"version_code" integer NOT NULL,
	"version_name" text NOT NULL,
	"channel" "release_channel" DEFAULT 'stable' NOT NULL,
	"status" "release_status" DEFAULT 'draft' NOT NULL,
	"rollout_percentage" integer DEFAULT 100,
	"release_notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions_detected" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"permission_name" text NOT NULL,
	"is_dangerous" boolean DEFAULT false NOT NULL,
	"is_new_since_previous" boolean DEFAULT false NOT NULL,
	"protection_level" "protection_level"
);
--> statement-breakpoint
CREATE TABLE "scan_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"scan_type" "scan_type" DEFAULT 'static' NOT NULL,
	"status" "scan_status" DEFAULT 'pending' NOT NULL,
	"risk_score" integer,
	"findings" jsonb,
	"summary" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sdk_fingerprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"sdk_name" text NOT NULL,
	"sdk_version" text,
	"category" "sdk_category" DEFAULT 'other' NOT NULL,
	"risk_flag" boolean DEFAULT false NOT NULL,
	"risk_reason" text
);
--> statement-breakpoint
CREATE TABLE "install_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"user_id" uuid,
	"device_fingerprint_hash" text,
	"installed_version_code" integer NOT NULL,
	"source" "install_source" DEFAULT 'store_app' NOT NULL,
	"os_version" text,
	"device_model" text,
	"success" boolean DEFAULT true NOT NULL,
	"failure_reason" text,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"installed_version_code" integer,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uninstalled_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"is_owned" boolean DEFAULT true NOT NULL,
	"source" "install_source" DEFAULT 'store_app' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "report_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"report_type" "report_type" NOT NULL,
	"description" text NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolution_notes" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_helpful_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"developer_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_responses_review_id_unique" UNIQUE("review_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"body" text,
	"version_code_reviewed" integer NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text,
	"email" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"country" text,
	"notification_preferences" jsonb DEFAULT '{"email":{"transactional":true,"reviewReply":true,"updateAvailable":true,"marketing":false},"push":{"transactional":false,"reviewReply":false,"updateAvailable":false,"marketing":false}}'::jsonb,
	"auth_provider" text,
	"auth_provider_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wishlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"request_path" text,
	"request_method" text,
	"diff" jsonb,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"icon_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "moderation_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"action" "moderation_action" NOT NULL,
	"reason" text NOT NULL,
	"moderator_id" uuid NOT NULL,
	"appeal_status" "appeal_status" DEFAULT 'none' NOT NULL,
	"appeal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"channel_name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transparency_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"reason" text NOT NULL,
	"rule_version" text NOT NULL,
	"previous_hash" text NOT NULL,
	"content_hash" text NOT NULL,
	"source_report_id" uuid,
	"source_appeal_id" uuid,
	"jurisdiction" text,
	"legal_basis" text,
	"response_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_identities" ADD CONSTRAINT "developer_identities_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_verification_evidence" ADD CONSTRAINT "developer_verification_evidence_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_verification_evidence" ADD CONSTRAINT "developer_verification_evidence_reviewed_by_developers_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signing_keys" ADD CONSTRAINT "signing_keys_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_listings" ADD CONSTRAINT "app_listings_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_metadata" ADD CONSTRAINT "artifact_metadata_artifact_id_release_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."release_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_artifacts" ADD CONSTRAINT "release_artifacts_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_reviewed_by_developers_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions_detected" ADD CONSTRAINT "permissions_detected_artifact_id_release_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."release_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_results" ADD CONSTRAINT "scan_results_artifact_id_release_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."release_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sdk_fingerprints" ADD CONSTRAINT "sdk_fingerprints_artifact_id_release_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."release_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "install_events" ADD CONSTRAINT "install_events_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_auth_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_id_developers_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_channels" ADD CONSTRAINT "release_channels_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_user_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_account_provider_account_idx" ON "auth_account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_session_token_idx" ON "auth_session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "auth_session_user_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_email_idx" ON "auth_user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "signing_keys_developer_fingerprint_idx" ON "signing_keys" USING btree ("developer_id","fingerprint_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_app_version_idx" ON "releases" USING btree ("app_id","version_code");--> statement-breakpoint
CREATE INDEX "permissions_detected_artifact_id_idx" ON "permissions_detected" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "scan_results_artifact_id_idx" ON "scan_results" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "sdk_fingerprints_artifact_id_idx" ON "sdk_fingerprints" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "install_events_app_id_idx" ON "install_events" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "install_events_user_id_idx" ON "install_events" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_user_app_idx" ON "library_entries" USING btree ("user_id","app_id");--> statement-breakpoint
CREATE INDEX "library_user_idx" ON "library_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "library_uninstalled_idx" ON "library_entries" USING btree ("uninstalled_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "review_helpful_votes_review_user_idx" ON "review_helpful_votes" USING btree ("review_id","user_id");--> statement-breakpoint
CREATE INDEX "review_helpful_votes_review_idx" ON "review_helpful_votes" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "review_responses_developer_idx" ON "review_responses" USING btree ("developer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_app_user_idx" ON "reviews" USING btree ("app_id","user_id");--> statement-breakpoint
CREATE INDEX "reviews_published_at_idx" ON "reviews" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "users_auth_user_idx" ON "users" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "users_deleted_at_idx" ON "users" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_user_app_idx" ON "wishlist_entries" USING btree ("user_id","app_id");--> statement-breakpoint
CREATE INDEX "wishlist_user_idx" ON "wishlist_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_actions_actor_idx" ON "admin_actions" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "admin_actions_created_at_idx" ON "admin_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_actions_target_idx" ON "admin_actions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "admin_actions_action_idx" ON "admin_actions" USING btree ("action");--> statement-breakpoint
CREATE INDEX "appeals_developer_idx" ON "appeals" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "appeals_status_idx" ON "appeals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "appeals_target_idx" ON "appeals" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "moderation_actions_target_idx" ON "moderation_actions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_channels_app_channel_idx" ON "release_channels" USING btree ("app_id","channel_name");--> statement-breakpoint
CREATE INDEX "transparency_events_event_type_idx" ON "transparency_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "transparency_events_target_idx" ON "transparency_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "transparency_events_created_at_idx" ON "transparency_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "transparency_events_jurisdiction_idx" ON "transparency_events" USING btree ("jurisdiction");