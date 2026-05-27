CREATE TYPE "public"."onchain_status" AS ENUM('pending', 'registered', 'failed');--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "onchain_status" "onchain_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "onchain_tx_hash" text;