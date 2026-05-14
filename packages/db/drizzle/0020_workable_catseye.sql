CREATE TYPE "public"."parental_control_rating" AS ENUM('everyone', 'teen', 'mature');--> statement-breakpoint
CREATE TYPE "public"."parental_control_role" AS ENUM('parent', 'child');--> statement-breakpoint
CREATE TABLE "parental_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "parental_control_role" NOT NULL,
	"parent_user_id" uuid,
	"unlinked_at" timestamp with time zone,
	"pin_hash" text,
	"pin_salt" text,
	"max_content_rating" "parental_control_rating" DEFAULT 'everyone' NOT NULL,
	"failed_pin_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"pending_invite_email" text,
	"pending_invite_token" text,
	"pending_invite_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parental_controls" ADD CONSTRAINT "parental_controls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parental_controls" ADD CONSTRAINT "parental_controls_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parental_controls_user_idx" ON "parental_controls" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "parental_controls_parent_idx" ON "parental_controls" USING btree ("parent_user_id");--> statement-breakpoint
CREATE INDEX "parental_controls_token_idx" ON "parental_controls" USING btree ("pending_invite_token");