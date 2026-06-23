#!/usr/bin/env tsx
/**
 * Backfill script: register listed resources missing on-chain
 *
 * Finds resources that are listed=true but onchain_status != "registered"
 * and registers them on the vault registry contract.
 *
 * Usage:
 *   npx tsx scripts/backfill-registry.ts [--dry-run]
 *
 * Prerequisites:
 *   - .env configured with valid Supabase + Stellar testnet credentials
 *   - REGISTRY_SECRET_KEY set to a funded Stellar account
 *   - REGISTRY_CONTRACT_ID set to deployed vault registry contract
 */

import { eq, and, ne } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { resources } from "../src/db/schema.js";
import { registryClient, registryKeypair } from "../src/services/registryClient.js";
import { config } from "../src/config.js";

interface BackfillStats {
  totalListed: number;
  alreadyRegistered: number;
  needsRegistration: number;
  registered: number;
  failed: number;
  errors: Array<{ resourceId: string; error: string }>;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log("=== MindVault Registry Backfill ===");
  console.log(`Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Registry Contract: ${config.REGISTRY_CONTRACT_ID}`);
  console.log(`Registry Account: ${registryKeypair.publicKey()}`);
  console.log();

  const stats: BackfillStats = {
    totalListed: 0,
    alreadyRegistered: 0,
    needsRegistration: 0,
    registered: 0,
    failed: 0,
    errors: [],
  };

  // Find all listed resources
  const listedResources = await db.select().from(resources).where(eq(resources.listed, true));

  stats.totalListed = listedResources.length;
  console.log(`Found ${stats.totalListed} listed resources`);

  if (stats.totalListed === 0) {
    console.log("No listed resources found. Nothing to backfill.");
    return;
  }

  // Filter to those not yet registered on-chain
  const needsRegistration = listedResources.filter((r) => r.onchainStatus !== "registered");

  stats.alreadyRegistered = stats.totalListed - needsRegistration.length;
  stats.needsRegistration = needsRegistration.length;

  console.log(`Already registered: ${stats.alreadyRegistered}`);
  console.log(`Needs registration: ${stats.needsRegistration}`);
  console.log();

  if (stats.needsRegistration === 0) {
    console.log("All listed resources are already registered on-chain.");
    return;
  }

  if (isDryRun) {
    console.log("DRY RUN - Resources that would be registered:");
    for (const resource of needsRegistration) {
      console.log(`  - ${resource.id}: "${resource.title}" (${resource.price} USDC)`);
    }
    console.log();
    console.log(`Would register ${stats.needsRegistration} resources.`);
    return;
  }

  // Register each resource on-chain
  console.log("Registering resources on-chain...");

  for (const resource of needsRegistration) {
    try {
      console.log(`Registering ${resource.id}: "${resource.title}"`);

      // Convert price from USDC string to stroops (7 decimals)
      const priceStroops = Math.round(parseFloat(resource.price) * 10_000_000);

      // Build metadata string (could be enhanced with more fields)
      const metadata = JSON.stringify({
        title: resource.title,
        description: resource.description,
        contentHash: resource.contentHash,
        mimeType: resource.mimeType,
      });

      // Register on-chain
      const tx = await registryClient.register({
        creator: registryKeypair.publicKey(),
        id: resource.id,
        price: BigInt(priceStroops),
        metadata,
        tags: [],
      });

      await tx.signAndSend({ signer: registryKeypair });

      // Update database status
      await db
        .update(resources)
        .set({ onchainStatus: "registered" })
        .where(eq(resources.id, resource.id));

      stats.registered++;
      console.log(`  ✓ Registered successfully`);
    } catch (error) {
      stats.failed++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      stats.errors.push({ resourceId: resource.id, error: errorMsg });

      console.log(`  ✗ Failed: ${errorMsg}`);

      // Update database to reflect failure
      await db
        .update(resources)
        .set({ onchainStatus: "failed" })
        .where(eq(resources.id, resource.id));
    }
  }

  // Summary
  console.log();
  console.log("=== Backfill Summary ===");
  console.log(`Total listed resources: ${stats.totalListed}`);
  console.log(`Already registered: ${stats.alreadyRegistered}`);
  console.log(`Attempted registration: ${stats.needsRegistration}`);
  console.log(`Successfully registered: ${stats.registered}`);
  console.log(`Failed: ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log();
    console.log("Errors:");
    for (const { resourceId, error } of stats.errors) {
      console.log(`  ${resourceId}: ${error}`);
    }
  }

  console.log();
  console.log(`Backfill complete. ${stats.registered} resources registered on-chain.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
}
