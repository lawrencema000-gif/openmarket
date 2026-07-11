CREATE TABLE "editorial_collection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"blurb" text,
	"rationale" text,
	"curator_name" text,
	"icon" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "editorial_collection_items" ADD CONSTRAINT "editorial_collection_items_collection_id_editorial_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."editorial_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_collection_items" ADD CONSTRAINT "editorial_collection_items_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_collection_items_unique_idx" ON "editorial_collection_items" USING btree ("collection_id","app_id");--> statement-breakpoint
CREATE INDEX "editorial_collection_items_order_idx" ON "editorial_collection_items" USING btree ("collection_id","position");--> statement-breakpoint
CREATE INDEX "editorial_collections_pub_idx" ON "editorial_collections" USING btree ("is_published","position");