/**
 * MindVault end-to-end test: publish -> verify -> register -> read back.
 *
 * Walks the full integrated flow against a running server:
 *   1. Health check         — server reachable
 *   2. Register publisher   — POST /publishers, returns API key tied to the test wallet
 *   3. Publish resource     — POST /resources (link), returns the new resource record
 *   4. Verify content       — POST /verify-content via x402-paid fetch; the agent
 *                             marks the resource verified + listed and flips
 *                             onchain_status to "pending"
 *   5. Poll for verification — GET /resources/:id/verification until status settles
 *   6. Register on-chain    — creator-signed `register` call against the vault-registry
 *                             Soroban contract using the test keypair
 *   7. Read back on-chain   — registry-client `get` and assert that id, creator,
 *                             metadata (contentHash), and price match the published
 *                             resource. This is the assertion the issue requires.
 *   8. Paywall round-trip   — GET /resources/:id returns 402 unpaid and 200 paid
 *   9. Cleanup              — DELETE /resources/:id
 *
 * Required server-side env (see server/.env.example):
 *   PAY_TO, AGENT_SECRET_KEY, REGISTRY_CONTRACT_ID, REGISTRY_SECRET_KEY,
 *   OPENROUTER_API_KEY, DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Test-specific env (all optional):
 *   E2E_BASE_URL           — server URL, defaults to BASE_URL or http://localhost:4021
 *   E2E_SECRET_KEY         — Stellar testnet S… secret of the test wallet (funded with
 *                            XLM for tx fees and Soroban USDC for x402 payments).
 *                            If unset, a fresh keypair is generated, logged, and
 *                            Friendbot-funded with XLM — but x402 payment will
 *                            fail without USDC.
 *   E2E_PUBLIC_KEY         — matching G… public key (cross-checked against the secret)
 *   E2E_SOROBAN_RPC_URL    — defaults to SOROBAN_RPC_URL / https://soroban-testnet.stellar.org
 *   E2E_NETWORK            — defaults to NETWORK / "stellar:testnet"
 *   E2E_REGISTRY_CONTRACT_ID — defaults to REGISTRY_CONTRACT_ID
 *   E2E_SKIP_ONCHAIN=1     — skip on-chain register + read back (kept for fast local runs)
 *   E2E_SKIP_PAYWALL=1     — skip the 402 paywall round-trip
 *
 * Run:
 *   pnpm e2e
 *     (or: pnpm tsx scripts/e2e-test.ts)
 */

import "dotenv/config";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import {
  Client as RegistryClient,
  Errors as RegistryErrors,
  type Resource as OnchainResource,
} from "@mindvault/registry-client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer } from "@x402/stellar";
import type { Network } from "@x402/core/types";

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || "http://localhost:4021";
const NETWORK_NAME = (process.env.E2E_NETWORK ||
  process.env.NETWORK ||
  "stellar:testnet") as Network;
const SOROBAN_RPC_URL =
  process.env.E2E_SOROBAN_RPC_URL ||
  process.env.SOROBAN_RPC_URL ||
  "https://soroban-testnet.stellar.org";
const REGISTRY_CONTRACT_ID =
  process.env.E2E_REGISTRY_CONTRACT_ID || process.env.REGISTRY_CONTRACT_ID;
const NETWORK_PASSPHRASE = NETWORK_NAME === "stellar:testnet" ? Networks.TESTNET : Networks.PUBLIC;
const SKIP_ONCHAIN = process.env.E2E_SKIP_ONCHAIN === "1";
const SKIP_PAYWALL = process.env.E2E_SKIP_PAYWALL === "1";
const VERIFY_TIMEOUT_MS = 60_000;
const VERIFY_POLL_MS = 2_000;
const USDC_DECIMALS = 7;

interface JsonResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
}

interface PublishedResource {
  id: string;
  publisherId: string;
  title: string;
  description: string | null;
  price: string;
  walletAddress: string;
  resourceType: "file" | "link";
  externalUrl: string | null;
  contentHash: string | null;
  verificationStatus: "pending" | "verified" | "rejected" | "skipped";
  listed: boolean;
  onchainStatus: "none" | "pending" | "registered" | "failed";
}

interface RegisterResponse {
  id: string;
  name: string;
  email: string;
  walletAddress: string;
  apiKey: string;
  createdAt: string;
}

interface VerificationResponse {
  resourceId: string;
  title: string;
  status: "pending" | "verified" | "rejected" | "skipped";
  listed: boolean;
  publishedAt: string;
  verification: {
    isOriginal: boolean;
    confidence: number;
    flags: string[];
    checkedAt: string;
  } | null;
}

let stepIndex = 0;
function startStep(name: string): void {
  stepIndex += 1;
  console.log(`\n[STEP ${stepIndex}] → ${name}`);
}
function passStep(message: string): void {
  console.log(`[STEP ${stepIndex}] ✓ ${message}`);
}
function info(message: string): void {
  console.log(`  ${message}`);
}

async function jsonRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<JsonResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, ok: res.ok, data: data as T };
}

interface TestWallet {
  keypair: Keypair;
  publicKey: string;
}

async function getOrCreateTestWallet(): Promise<TestWallet> {
  const secret = process.env.E2E_SECRET_KEY;
  if (secret) {
    const keypair = Keypair.fromSecret(secret);
    const publicKey = keypair.publicKey();
    const expected = process.env.E2E_PUBLIC_KEY;
    if (expected && expected !== publicKey) {
      throw new Error(
        `E2E_PUBLIC_KEY (${expected}) does not match the public key derived from E2E_SECRET_KEY (${publicKey})`,
      );
    }
    info(`using wallet from E2E_SECRET_KEY: ${publicKey}`);
    return { keypair, publicKey };
  }

  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  info(`generated fresh test wallet: ${publicKey}`);
  info(`  secret: ${keypair.secret()}`);
  info(`  save these to .env as E2E_PUBLIC_KEY / E2E_SECRET_KEY to reuse`);

  info("funding via Friendbot…");
  const res = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  if (!res.ok) {
    throw new Error(`Friendbot funding failed: HTTP ${res.status} ${res.statusText}`);
  }
  info("  funded with XLM (USDC for x402 must be acquired separately — see scripts/setup-usdc.ts)");
  return { keypair, publicKey };
}

async function pollForVerification(resourceId: string): Promise<VerificationResponse> {
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  let lastStatus = "pending";
  while (Date.now() < deadline) {
    const res = await jsonRequest<VerificationResponse>(
      "GET",
      `/resources/${resourceId}/verification`,
    );
    if (res.ok && res.data) {
      lastStatus = res.data.status;
      if (res.data.status === "verified" || res.data.status === "rejected") {
        return res.data;
      }
    }
    await sleep(VERIFY_POLL_MS);
  }
  throw new Error(
    `Verification did not settle within ${VERIFY_TIMEOUT_MS}ms (last status: ${lastStatus})`,
  );
}

function usdcToStroops(price: string): bigint {
  const cleaned = price.trim();
  const [whole, frac = ""] = cleaned.split(".");
  const padded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  const negative = whole.startsWith("-");
  const wholePart = BigInt((negative ? whole.slice(1) : whole) || "0");
  const fracPart = BigInt(padded || "0");
  const result = wholePart * BigInt(10 ** USDC_DECIMALS) + fracPart;
  return negative ? -result : result;
}

async function readOnChain(resourceId: string): Promise<OnchainResource | null> {
  if (!REGISTRY_CONTRACT_ID) {
    throw new Error("REGISTRY_CONTRACT_ID is not set");
  }
  const client = new RegistryClient({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  const tx = await client.get({ id: resourceId });
  const result = tx.result;
  if (result.isErr()) {
    const err = result.unwrapErr();
    if (err.message === RegistryErrors[2].message) return null; // NotFound
    throw new Error(`Contract error reading resource: ${err.message}`);
  }
  return result.unwrap();
}

async function registerOnChain(args: {
  resourceId: string;
  creator: string;
  keypair: Keypair;
  priceUsdc: string;
  metadata: string;
}): Promise<void> {
  if (!REGISTRY_CONTRACT_ID) {
    throw new Error("REGISTRY_CONTRACT_ID is not set");
  }

  const existing = await readOnChain(args.resourceId);
  if (existing) {
    info("resource already registered on-chain — skipping register tx");
    return;
  }

  const { signTransaction, signAuthEntry } = basicNodeSigner(args.keypair, NETWORK_PASSPHRASE);

  const client = new RegistryClient({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey: args.creator,
    signTransaction,
    signAuthEntry,
  });

  const priceStroops = usdcToStroops(args.priceUsdc);
  const tx = await client.register({
    creator: args.creator,
    id: args.resourceId,
    price: priceStroops,
    metadata: args.metadata,
    tags: [],
  });

  const sent = await tx.signAndSend();
  const txStatus = sent.getTransactionResponse?.status;
  if (txStatus && txStatus !== "SUCCESS") {
    throw new Error(`Register tx did not succeed: status=${txStatus}`);
  }

  const result = sent.result;
  if (result.isErr()) {
    throw new Error(`Register contract call returned error: ${result.unwrapErr().message}`);
  }
}

function assertOnchainMatches(onchain: OnchainResource, published: PublishedResource): void {
  if (onchain.id !== published.id) {
    throw new Error(`on-chain id mismatch: got "${onchain.id}", expected "${published.id}"`);
  }
  if (onchain.creator !== published.walletAddress) {
    throw new Error(
      `on-chain creator mismatch: got "${onchain.creator}", expected "${published.walletAddress}"`,
    );
  }
  const expectedMetadata = published.contentHash ?? "";
  if (expectedMetadata && onchain.metadata !== expectedMetadata) {
    throw new Error(
      `on-chain metadata mismatch: got "${onchain.metadata}", expected "${expectedMetadata}"`,
    );
  }
  const expectedPrice = usdcToStroops(published.price);
  if (BigInt(onchain.price) !== expectedPrice) {
    throw new Error(
      `on-chain price mismatch: got ${onchain.price.toString()}, expected ${expectedPrice.toString()}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runE2E(): Promise<void> {
  console.log("=== MindVault E2E: publish -> verify -> register -> read back ===");
  console.log(`Server:   ${BASE_URL}`);
  console.log(`Network:  ${NETWORK_NAME}`);
  console.log(`RPC:      ${SOROBAN_RPC_URL}`);
  if (REGISTRY_CONTRACT_ID) {
    console.log(`Registry: ${REGISTRY_CONTRACT_ID}`);
  }

  startStep("Health check");
  const health = await jsonRequest<{ status: string }>("GET", "/health");
  if (!health.ok) {
    throw new Error(`Server not reachable at ${BASE_URL}: HTTP ${health.status}`);
  }
  passStep(`server is up (status=${(health.data as { status?: string })?.status ?? "ok"})`);

  startStep("Set up test wallet");
  const wallet = await getOrCreateTestWallet();
  passStep(`wallet ready: ${wallet.publicKey}`);

  startStep("Register publisher");
  const email = `e2e-${Date.now()}@mindvault.test`;
  const register = await jsonRequest<RegisterResponse>("POST", "/publishers", {
    name: "E2E Test Publisher",
    email,
    walletAddress: wallet.publicKey,
  });
  if (register.status !== 201 || !register.data?.apiKey) {
    throw new Error(`Register failed: HTTP ${register.status}: ${JSON.stringify(register.data)}`);
  }
  const apiKey = register.data.apiKey;
  const authHeaders = { "x-api-key": apiKey };
  passStep(`publisher ${register.data.id} registered (wallet=${register.data.walletAddress})`);

  startStep("Publish resource");
  const externalUrl = `https://example.com/e2e-dataset-${Date.now()}.csv`;
  const publishTitle = "E2E Dataset: Synthetic ML benchmark results";
  const publishDescription =
    "A curated set of benchmark scores across vision and NLP models, gathered over six months of evaluation runs. Includes raw scores, model configs, and reproducibility notes.";
  const publishPrice = "0.05";

  const publish = await jsonRequest<PublishedResource>(
    "POST",
    "/resources",
    {
      title: publishTitle,
      description: publishDescription,
      price: publishPrice,
      externalUrl,
    },
    authHeaders,
  );
  if (publish.status !== 201 || !publish.data?.id) {
    throw new Error(`Publish failed: HTTP ${publish.status}: ${JSON.stringify(publish.data)}`);
  }
  const resource = publish.data;
  if (!resource.contentHash) {
    throw new Error(`Publish response is missing contentHash: ${JSON.stringify(resource)}`);
  }
  passStep(`resource ${resource.id} published (contentHash=${resource.contentHash.slice(0, 16)}…)`);

  let cleanupRequired = true;
  try {
    startStep("Pay verification fee via x402 and verify content");
    const x402Signer = createEd25519Signer(wallet.keypair.secret(), NETWORK_NAME);
    const x402 = new x402Client().register(NETWORK_NAME, new ExactStellarScheme(x402Signer));
    const paidFetch = wrapFetchWithPayment(fetch, x402);

    const verifyBody = `${publishTitle}\n\n${publishDescription}\n\nSource URL: ${externalUrl}`;
    const verifyRes = await paidFetch(`${BASE_URL}/verify-content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: verifyBody, resourceId: resource.id }),
    });
    if (!verifyRes.ok) {
      const errBody = await verifyRes.text().catch(() => "");
      throw new Error(`verify-content failed: HTTP ${verifyRes.status}: ${errBody}`);
    }
    const verifyJson = (await verifyRes.json()) as {
      isOriginal: boolean;
      confidence: number;
      flags: string[];
    };
    if (!verifyJson.isOriginal) {
      throw new Error(
        `verification rejected the content: flags=${JSON.stringify(verifyJson.flags)}`,
      );
    }
    passStep(`verification approved (confidence=${verifyJson.confidence.toFixed(2)})`);

    startStep("Poll resource verification status until settled");
    const verified = await pollForVerification(resource.id);
    if (verified.status !== "verified" || !verified.listed) {
      throw new Error(
        `resource did not reach verified+listed within ${VERIFY_TIMEOUT_MS}ms: status=${verified.status}, listed=${verified.listed}`,
      );
    }
    passStep(
      `resource ${resource.id} is verified and listed (confidence=${
        verified.verification?.confidence ?? "n/a"
      })`,
    );

    if (SKIP_ONCHAIN) {
      info("E2E_SKIP_ONCHAIN=1 — skipping on-chain register / read back");
    } else {
      if (!REGISTRY_CONTRACT_ID) {
        throw new Error(
          "REGISTRY_CONTRACT_ID is required for on-chain steps; set it or pass E2E_SKIP_ONCHAIN=1",
        );
      }
      startStep("Register resource on-chain (creator-signed)");
      await registerOnChain({
        resourceId: resource.id,
        creator: wallet.publicKey,
        keypair: wallet.keypair,
        priceUsdc: resource.price,
        metadata: resource.contentHash,
      });
      passStep(`on-chain register confirmed for ${resource.id}`);

      startStep("Read on-chain record and assert it matches the published resource");
      const onchain = await readOnChain(resource.id);
      if (!onchain) {
        throw new Error(`on-chain resource ${resource.id} not found after register`);
      }
      assertOnchainMatches(onchain, resource);
      passStep(
        `on-chain Resource matches: id=${onchain.id}, creator=${onchain.creator}, price=${onchain.price.toString()} stroops`,
      );
    }

    if (SKIP_PAYWALL) {
      info("E2E_SKIP_PAYWALL=1 — skipping 402 paywall round-trip");
    } else {
      startStep("Access resource without payment (expect 402)");
      const unpaid = await jsonRequest("GET", `/resources/${resource.id}`);
      if (unpaid.status !== 402) {
        throw new Error(
          `expected 402 Payment Required for unpaid access, got HTTP ${unpaid.status}`,
        );
      }
      passStep("paywall returned 402 as expected");

      startStep("Access resource with x402 payment (expect 200 + matching content)");
      const paid = await paidFetch(`${BASE_URL}/resources/${resource.id}`);
      if (!paid.ok) {
        const body = await paid.text().catch(() => "");
        throw new Error(`paid access failed: HTTP ${paid.status}: ${body}`);
      }
      const paidJson = (await paid.json()) as {
        url?: string;
        receipt?: { amount?: string; paidTo?: string };
      };
      if (paidJson.url !== externalUrl) {
        throw new Error(`paid access returned url="${paidJson.url}", expected "${externalUrl}"`);
      }
      passStep(
        `paid access returned expected url; receipt: ${paidJson.receipt?.amount} USDC -> ${paidJson.receipt?.paidTo}`,
      );
    }
  } finally {
    if (cleanupRequired) {
      startStep("Cleanup: delist resource");
      const del = await jsonRequest("DELETE", `/resources/${resource.id}`, undefined, authHeaders);
      if (del.ok) {
        passStep(`resource ${resource.id} delisted`);
      } else {
        info(`delist returned HTTP ${del.status} (continuing)`);
      }
    }
  }

  console.log("\n=== E2E PASSED ===");
}

runE2E().catch((err: unknown) => {
  console.error("\n✗ E2E FAILED");
  if (err instanceof Error) {
    console.error(err.message);
    if (err.stack) console.error(err.stack);
  } else {
    console.error(err);
  }
  process.exit(1);
});
