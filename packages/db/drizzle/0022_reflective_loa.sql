ALTER TABLE "release_artifacts" ADD COLUMN "parent_artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "release_artifacts" ADD COLUMN "manifest" jsonb;