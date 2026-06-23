/**
 * Seed script — populates the catalog with sample resources for local dev.
 *
 * Safe to re-run: skips any resource whose title already exists for the seed
 * publisher (identified by the fixed seed email).
 *
 * Usage:
 *   pnpm seed                  # DB only
 *   pnpm seed --onchain        # DB + register each resource on Stellar testnet
 */

import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { publishers, resources } from "../src/db/schema.js";
import { registerPublisher } from "../src/services/publisherService.js";
import { createLinkResource } from "../src/services/resourceService.js";
import { registryClient, registryKeypair } from "../src/services/registryClient.js";
import { config } from "../src/config.js";

const SEED_EMAIL = "seed-dev@mindvault.local";

const SAMPLE_RESOURCES = [
  {
    title: "GPT Prompt Engineering Cheatsheet",
    description: "A concise reference for writing effective prompts across major LLM providers.",
    price: "0.25",
    externalUrl: "https://example.com/prompt-cheatsheet",
  },
  {
    title: "Stellar Smart Contract Patterns",
    description: "Common Soroban contract patterns with annotated Rust examples.",
    price: "0.50",
    externalUrl: "https://example.com/soroban-patterns",
  },
  {
    title: "AI Agent Evaluation Dataset",
    description: "500 labelled task/response pairs for benchmarking autonomous agents.",
    price: "1.00",
    externalUrl: "https://example.com/agent-eval-dataset",
  },
  {
    title: "Minimal RAG Pipeline (Python)",
    description: "A single-file retrieval-augmented generation pipeline using FAISS and OpenAI.",
    price: "0.10",
    externalUrl: "https://example.com/rag-pipeline",
  },
  {
    title: "DeFi Yield Farming Research Report",
    description: "Analysis of yield strategies across Stellar, Ethereum, and Solana ecosystems.",
    price: "2.00",
    externalUrl: "https://example.com/defi-yield-report",
  },
] as const;

async function getOrCreateSeedPublisher() {
  const [existing] = await db
    .select()
    .from(publishers)
    .where(eq(publishers.email, SEED_EMAIL))
    .limit(1);

  if (existing) {
    console.log(`  Publisher already exists (id: ${existing.id})`);
    return existing;
  }

  const { publisher } = await registerPublisher({
    name: "MindVault Seed",
    email: SEED_EMAIL,
    walletAddress: config.PAY_TO,
  });
  console.log(`  Created seed publisher (id: ${publisher.id})`);
  return publisher;
}

async function seedResources(publisherId: string, onchain: boolean) {
  const existing = await db
    .select({ title: resources.title })
    .from(resources)
    .where(eq(resources.publisherId, publisherId));

  const existingTitles = new Set(existing.map((r) => r.title));

  for (const sample of SAMPLE_RESOURCES) {
    if (existingTitles.has(sample.title)) {
      console.log(`  Skipping "${sample.title}" (already exists)`);
      continue;
    }

    const resource = await createLinkResource({
      publisherId,
      title: sample.title,
      description: sample.description,
      price: sample.price,
      walletAddress: config.PAY_TO,
      externalUrl: sample.externalUrl,
    });

    // Mark as verified + listed so it appears in the catalog immediately
    await db
      .update(resources)
      .set({ verificationStatus: "verified", listed: true })
      .where(eq(resources.id, resource.id));

    console.log(`  Created "${sample.title}" ($${sample.price}) — id: ${resource.id}`);

    if (onchain) {
      await registerOnChain(resource);
    }
  }
}

async function registerOnChain(resource: {
  id: string;
  title: string;
  description: string | null;
  price: string;
  contentHash: string | null;
  mimeType: string | null;
}) {
  try {
    const metadata = JSON.stringify({
      title: resource.title,
      description: resource.description,
      contentHash: resource.contentHash,
      mimeType: resource.mimeType,
    });

    const tx = await registryClient.register({
      creator: registryKeypair.publicKey(),
      id: resource.id,
      price: BigInt(Math.round(parseFloat(resource.price) * 10_000_000)),
      metadata,
      tags: [],
    });

    await tx.signAndSend({ signer: registryKeypair });

    await db
      .update(resources)
      .set({ onchainStatus: "registered" })
      .where(eq(resources.id, resource.id));

    console.log(`    ✓ Registered on-chain`);
  } catch (err) {
    console.warn(`    ⚠ On-chain registration failed: ${(err as Error).message}`);
  }
}

async function main() {
  const onchain = process.argv.includes("--onchain");

  console.log("Seeding MindVault catalog...");
  if (onchain) console.log("  (--onchain: will register on Stellar testnet)");

  const publisher = await getOrCreateSeedPublisher();
  await seedResources(publisher.id, onchain);

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
