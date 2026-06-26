import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { resources } from "../db/schema.js";
import {
  NETWORK_PASSPHRASE,
  registryClient,
  registryKeypair,
  resourceExists,
} from "../services/registryClient.js";
import { config } from "../config.js";
import { getLogger } from "../lib/logger.js";

const WORKER_INTERVAL_MS = 60_000;
const PENDING_THRESHOLD_MINUTES = 5;
const MAX_RETRY_ATTEMPTS = 3;

const retryCounts = new Map<string, number>();

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startRetryPendingWorker(): void {
  getLogger().info(
    { event: "retry_worker_start", intervalMs: WORKER_INTERVAL_MS },
    "starting retry-pending worker",
  );

  tick();
  intervalHandle = setInterval(tick, WORKER_INTERVAL_MS);
}

export function stopRetryPendingWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  retryCounts.clear();
}

async function tick(): Promise<void> {
  try {
    const cutoff = sql`NOW() - INTERVAL '5 minutes'`;

    const stuck = await db
      .select()
      .from(resources)
      .where(and(eq(resources.onchainStatus, "pending"), lt(resources.createdAt, cutoff)));

    if (stuck.length === 0) return;

    getLogger().info(
      { event: "retry_worker_tick", stuckCount: stuck.length },
      "found stuck resources to retry",
    );

    for (const resource of stuck) {
      await retryResource(resource);
    }
  } catch (err) {
    getLogger().error({ event: "retry_worker_tick_error", err }, "retry worker tick failed");
  }
}

async function retryResource(resource: typeof resources.$inferSelect): Promise<void> {
  const log = getLogger().child({ resourceId: resource.id });

  try {
    const exists = await resourceExists(resource.id);
    if (exists) {
      log.info(
        { event: "retry_already_registered" },
        "resource already registered on-chain; updating DB",
      );
      await db
        .update(resources)
        .set({ onchainStatus: "registered" })
        .where(eq(resources.id, resource.id));
      retryCounts.delete(resource.id);
      return;
    }

    const attempts = (retryCounts.get(resource.id) ?? 0) + 1;
    retryCounts.set(resource.id, attempts);

    if (attempts > MAX_RETRY_ATTEMPTS) {
      log.warn(
        { event: "retry_exhausted", attempts: attempts - 1 },
        "max retry attempts exhausted; marking as failed",
      );
      await db
        .update(resources)
        .set({ onchainStatus: "failed" })
        .where(eq(resources.id, resource.id));
      retryCounts.delete(resource.id);
      return;
    }

    log.info(
      { event: "retry_attempt", attempt: attempts, maxAttempts: MAX_RETRY_ATTEMPTS },
      "re-attempting on-chain registration",
    );

    const priceStroops = Math.round(parseFloat(resource.price) * 10_000_000);
    const metadata = JSON.stringify({
      title: resource.title,
      description: resource.description ?? "",
      contentHash: resource.contentHash,
    });

    const tx = await registryClient.register({
      creator: registryKeypair.publicKey(),
      id: resource.id,
      price: BigInt(priceStroops),
      metadata,
      tags: [],
    });

    const { Transaction } = await import("@stellar/stellar-sdk");
    const sent = await tx.signAndSend({
      signTransaction: async (xdr: string) => {
        const stellarTx = new Transaction(xdr, NETWORK_PASSPHRASE);
        stellarTx.sign(registryKeypair);
        return { signedTxXdr: stellarTx.toXDR() };
      },
    });
    const txHash = sent?.sendTransactionResponse?.hash ?? "";

    await db
      .update(resources)
      .set({
        onchainStatus: "registered",
        ...(txHash ? { onchainTxHash: txHash } : {}),
      })
      .where(eq(resources.id, resource.id));

    retryCounts.delete(resource.id);
    log.info(
      { event: "retry_success", txHash: txHash || undefined },
      "on-chain registration retry succeeded",
    );
  } catch (err: any) {
    log.error(
      { event: "retry_error", err: err?.message ?? String(err) },
      "on-chain registration retry failed",
    );

    const attempts = retryCounts.get(resource.id) ?? 1;
    if (attempts > MAX_RETRY_ATTEMPTS) {
      log.warn(
        { event: "retry_exhausted_on_error", attempts: attempts - 1 },
        "max retry attempts exhausted after error; marking as failed",
      );
      await db
        .update(resources)
        .set({ onchainStatus: "failed" })
        .where(eq(resources.id, resource.id));
      retryCounts.delete(resource.id);
    }
  }
}
