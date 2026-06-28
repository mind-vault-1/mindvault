ALTER TABLE "resources" ADD COLUMN "thumbnail_path" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "onchain_tx_hash" text;--> statement-breakpoint
CREATE INDEX "idx_resources_catalog_filter_sort" ON "resources" USING btree ("listed","verification_status","created_at");