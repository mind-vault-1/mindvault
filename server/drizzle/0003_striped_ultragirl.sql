CREATE TYPE "public"."onchain_status_enum" AS ENUM('none', 'pending', 'registered', 'failed');--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "onchain_status" "onchain_status_enum" DEFAULT 'none' NOT NULL;