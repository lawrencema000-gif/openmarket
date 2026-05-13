ALTER TABLE "apps" ADD COLUMN "source_code_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "source_code_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "reproducible_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "reproducible_verified_at" timestamp with time zone;