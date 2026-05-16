DROP INDEX "purchases_stripe_idx";--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "stripe_checkout_session_id" text;--> statement-breakpoint
CREATE INDEX "purchases_stripe_intent_idx" ON "purchases" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "purchases_stripe_session_idx" ON "purchases" USING btree ("stripe_checkout_session_id");