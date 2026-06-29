CREATE INDEX IF NOT EXISTS "idx_resources_publisher_id" ON "resources" ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_resources_verification_status" ON "resources" ("verification_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_payer_address" ON "payments" ("payer_address");
