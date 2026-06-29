ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "total_tokens" integer;--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "estimated_cost" text;
