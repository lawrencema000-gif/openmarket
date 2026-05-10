CREATE TYPE "public"."rollout_status" AS ENUM('live', 'paused', 'halted', 'completed');--> statement-breakpoint
CREATE TABLE "release_rollouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"percentage" integer NOT NULL,
	"status" "rollout_status" NOT NULL,
	"reason" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "rollout_status" "rollout_status" DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "release_rollouts" ADD CONSTRAINT "release_rollouts_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "release_rollouts_release_idx" ON "release_rollouts" USING btree ("release_id","created_at");