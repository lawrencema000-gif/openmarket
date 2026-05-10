CREATE TABLE "app_chart_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chart_slug" text NOT NULL,
	"window_key" text NOT NULL,
	"category" text,
	"app_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"score" double precision NOT NULL,
	"delta_position" integer,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_chart_positions" ADD CONSTRAINT "app_chart_positions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_chart_positions_chart_idx" ON "app_chart_positions" USING btree ("chart_slug","window_key","category","position");--> statement-breakpoint
CREATE UNIQUE INDEX "app_chart_positions_unique_idx" ON "app_chart_positions" USING btree ("chart_slug","window_key","category","app_id");