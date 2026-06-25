import { pgTable, text, real, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const resourceTypeEnum = pgEnum("resource_type", ["file", "link"]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "pending",
  "verified",
  "rejected",
  "skipped",
]);

export const onchainStatusEnum = pgEnum("onchain_status_enum", [
  "none",
  "pending",
  "registered",
  "failed",
]);

// Publishers — humans or AI agents that publish resources
export const publishers = pgTable("publishers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  apiKeyHash: text("api_key_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Resources — digital assets published on the marketplace
export const resources = pgTable("resources", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  publisherId: text("publisher_id")
    .notNull()
    .references(() => publishers.id),
  title: text("title").notNull(),
  description: text("description"),
  price: text("price").notNull(), // USDC amount as string, e.g. "0.50"
  walletAddress: text("wallet_address").notNull(), // payTo for this resource
  resourceType: resourceTypeEnum("resource_type").notNull(),
  storagePath: text("storage_path"), // Supabase Storage path (for type "file")
  contentHash: text("content_hash"), // SHA-256 of canonical content (URL for links, file bytes for files)
  externalUrl: text("external_url"), // For type "link"
  mimeType: text("mime_type"),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("pending"),
  verificationId: text("verification_id"),
  listed: boolean("listed").notNull().default(false),
  onchainStatus: onchainStatusEnum("onchain_status").notNull().default("none"),
  onchainTxHash: text("onchain_tx_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Verifications — AI originality check results
export const verifications = pgTable("verifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  resourceId: text("resource_id")
    .notNull()
    .references(() => resources.id),
  isOriginal: boolean("is_original").notNull(),
  confidence: real("confidence").notNull(), // 0.0 - 1.0
  flags: text("flags"), // JSON stringified array of issues
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
});

// Payments — tracks x402 payments for resources
export const payments = pgTable("payments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  resourceId: text("resource_id")
    .notNull()
    .references(() => resources.id),
  payerAddress: text("payer_address").notNull(),
  recipientAddress: text("recipient_address").notNull(),
  amount: text("amount").notNull(), // USDC amount
  paidAt: timestamp("paid_at").defaultNow().notNull(),
});
