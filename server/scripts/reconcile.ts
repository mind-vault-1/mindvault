/**
 * Reconciliation script for MindVault.
 *
 * Walks every resource in the database that is marked as `onchain_status =
 * "registered"`, fetches the matching entry from the vault-registry contract on
 * Stellar, and reports any discrepancies between the two. The script is
 * read-only — it does not modify the database or the contract.
 *
 * Run via `pnpm reconcile` (from `server/`) or `pnpm tsx scripts/reconcile.ts`.
 *
 * Exit codes:
 *   0 — all checked resources are in sync
 *   1 — one or more discrepancies were found
 *   2 — the script failed to run (config/network error)
 */
import { and, eq, ne } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { resources } from "../src/db/schema.js";
import { getResource, resourceCount } from "../src/services/registryClient.js";

// USDC has 7 decimals on Soroban; 1 USDC == 10_000_000 stroops.
const STROOPS_PER_USDC = 10_000_000n;

interface MismatchEntry {
  resourceId: string;
  dbPrice: string;
  chainPrice: string;
  publisherWallet: string;
}

interface MissingOnChainEntry {
  resourceId: string;
  dbPrice: string;
  publisherWallet: string;
}

interface MissingInDbEntry {
  resourceId: string;
  chainPrice: string;
}

interface OwnerMismatchEntry {
  resourceId: string;
  dbOwner: string;
  chainOwner: string;
}

interface ListingDriftEntry {
  resourceId: string;
  dbListed: boolean;
  onchainStatus: string;
}

export interface ReconciliationSummary {
  checkedAt: string;
  totalChecked: number;
  inSync: number;
  mismatches: MismatchEntry[];
  ownerMismatches: OwnerMismatchEntry[];
  missingOnChain: MissingOnChainEntry[];
  missingInDb: MissingInDbEntry[];
  listingDrift: ListingDriftEntry[];
}

/** Convert a USDC string like "0.50" to stroops (bigint, 7 decimals). */
function usdcStringToStroops(usdc: string): bigint {
  const [whole, fracRaw = ""] = usdc.trim().split(".");
  const frac = (fracRaw + "0000000").slice(0, 7);
  const sign = whole.startsWith("-") ? -1n : 1n;
  const wholeAbs = whole.replace(/^-/, "") || "0";
  return sign * (BigInt(wholeAbs) * STROOPS_PER_USDC + BigInt(frac || "0"));
}

/** Convert stroops (bigint) back to a fixed 7-decimal USDC string. */
function stroopsToUsdcString(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOPS_PER_USDC;
  const frac = abs % STROOPS_PER_USDC;
  const fracStr = frac.toString().padStart(7, "0").replace(/0+$/, "");
  const body = fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
  return negative ? `-${body}` : body;
}

/**
 * Print a human-readable summary block to stdout. Pure: only writes to stdout
 * and returns the exit code the caller should use. Kept side-effect-light so
 * it can be unit-tested independently of the DB/RPC calls above.
 */
export function printSummary(summary: ReconciliationSummary): 0 | 1 {
  const totalIssues =
    summary.mismatches.length +
    summary.ownerMismatches.length +
    summary.missingOnChain.length +
    summary.missingInDb.length +
    summary.listingDrift.length;

  const line = "========================================";
  const sub = "----------------------------------------";

  const out: string[] = [];
  out.push(line);
  out.push("MindVault Reconciliation Summary");
  out.push(`Run at: ${summary.checkedAt}`);
  out.push(`Resources checked:      ${summary.totalChecked}`);
  out.push(`In sync:                ${summary.inSync}`);
  out.push(`Price mismatches:       ${summary.mismatches.length}`);
  out.push(`Owner mismatches:       ${summary.ownerMismatches.length}`);
  out.push(`Missing on-chain:       ${summary.missingOnChain.length}`);
  out.push(`Missing in DB:          ${summary.missingInDb.length}`);
  out.push(`Listing drift:          ${summary.listingDrift.length}`);

  if (summary.mismatches.length > 0) {
    out.push("");
    out.push(`PRICE MISMATCHES (${summary.mismatches.length})`);
    out.push(sub);
    for (const m of summary.mismatches) {
      out.push(`Resource ID: ${m.resourceId}`);
      out.push(`DB price:    ${m.dbPrice} USDC`);
      out.push(`Chain price: ${m.chainPrice} USDC`);
      out.push(`Publisher:   ${m.publisherWallet}`);
      out.push("");
    }
  }

  if (summary.ownerMismatches.length > 0) {
    out.push("");
    out.push(`OWNER MISMATCHES (${summary.ownerMismatches.length})`);
    out.push(sub);
    for (const m of summary.ownerMismatches) {
      out.push(`Resource ID: ${m.resourceId}`);
      out.push(`DB owner:    ${m.dbOwner}`);
      out.push(`Chain owner: ${m.chainOwner}`);
      out.push("");
    }
  }

  if (summary.missingOnChain.length > 0) {
    out.push(`MISSING ON-CHAIN (${summary.missingOnChain.length})`);
    out.push(sub);
    for (const m of summary.missingOnChain) {
      out.push(`Resource ID: ${m.resourceId}`);
      out.push(`DB price:    ${m.dbPrice} USDC`);
      out.push(`Publisher:   ${m.publisherWallet}`);
      out.push("");
    }
  }

  if (summary.missingInDb.length > 0) {
    out.push(`MISSING IN DB (${summary.missingInDb.length})`);
    out.push(sub);
    for (const m of summary.missingInDb) {
      out.push(`Resource ID: ${m.resourceId}`);
      out.push(`Chain price: ${m.chainPrice} USDC`);
      out.push("");
    }
  }

  if (summary.listingDrift.length > 0) {
    out.push(`LISTING DRIFT (${summary.listingDrift.length})`);
    out.push(sub);
    for (const m of summary.listingDrift) {
      out.push(`Resource ID:    ${m.resourceId}`);
      out.push(`DB listed:      ${m.dbListed}`);
      out.push(`On-chain status: ${m.onchainStatus} (expected "registered")`);
      out.push("");
    }
  }

  out.push(line);
  if (totalIssues === 0) {
    out.push("Result: ALL CLEAR");
    process.stdout.write(out.join("\n") + "\n");
    return 0;
  }
  out.push(`Result: NEEDS ATTENTION (${totalIssues} issues found)`);
  process.stdout.write(out.join("\n") + "\n");
  return 1;
}

export async function reconcile(): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = {
    checkedAt: new Date().toISOString(),
    totalChecked: 0,
    inSync: 0,
    mismatches: [],
    ownerMismatches: [],
    missingOnChain: [],
    missingInDb: [],
    listingDrift: [],
  };

  const registeredRows = await db
    .select()
    .from(resources)
    .where(eq(resources.onchainStatus, "registered"));

  summary.totalChecked = registeredRows.length;

  for (const row of registeredRows) {
    process.stdout.write(`Checking ${row.id} ... `);
    const onChain = await getResource(row.id);
    if (onChain === null) {
      process.stdout.write("MISSING ON-CHAIN\n");
      summary.missingOnChain.push({
        resourceId: row.id,
        dbPrice: row.price,
        publisherWallet: row.walletAddress,
      });
      continue;
    }

    const problems: string[] = [];

    const dbStroops = usdcStringToStroops(row.price);
    if (onChain.price !== dbStroops) {
      problems.push(`price db=${row.price} chain=${stroopsToUsdcString(onChain.price)}`);
      summary.mismatches.push({
        resourceId: row.id,
        dbPrice: row.price,
        chainPrice: stroopsToUsdcString(onChain.price),
        publisherWallet: row.walletAddress,
      });
    }

    // Owner drift: the DB payTo wallet should match the on-chain creator.
    if (onChain.creator !== row.walletAddress) {
      problems.push(`owner db=${row.walletAddress} chain=${onChain.creator}`);
      summary.ownerMismatches.push({
        resourceId: row.id,
        dbOwner: row.walletAddress,
        chainOwner: onChain.creator,
      });
    }

    if (problems.length > 0) {
      process.stdout.write(`DRIFT (${problems.join("; ")})\n`);
    } else {
      process.stdout.write("OK\n");
      summary.inSync++;
    }
  }

  // The contract exposes count() but no enumeration, so we cannot list the IDs
  // of on-chain entries that have no DB row. We can still detect that there
  // *are* such entries by comparing counts, and surface a single placeholder
  // entry so the operator knows to investigate manually.
  try {
    const chainCount = await resourceCount();
    const dbRegisteredCount = registeredRows.length;
    if (chainCount > dbRegisteredCount) {
      const delta = chainCount - dbRegisteredCount;
      summary.missingInDb.push({
        resourceId: `<${delta} entr${delta === 1 ? "y" : "ies"} on-chain not in DB; contract has no enumeration>`,
        chainPrice: "n/a",
      });
    }
  } catch (err) {
    process.stderr.write(
      `Warning: could not read on-chain count for orphan check: ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
  }

  // Listing drift: resources advertised in the marketplace (listed = true) that
  // are not registered on-chain, so the catalog shows them but the registry has
  // no verifiable entry.
  const listedNotRegistered = await db
    .select()
    .from(resources)
    .where(and(eq(resources.listed, true), ne(resources.onchainStatus, "registered")));

  for (const row of listedNotRegistered) {
    summary.listingDrift.push({
      resourceId: row.id,
      dbListed: true,
      onchainStatus: row.onchainStatus,
    });
  }

  return summary;
}

async function main(): Promise<void> {
  const wantJson = process.argv.includes("--json");

  let summary: ReconciliationSummary;
  try {
    summary = await reconcile();
  } catch (err) {
    process.stderr.write(
      `Reconciliation failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(2);
  }

  if (wantJson) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    const issues =
      summary.mismatches.length +
      summary.ownerMismatches.length +
      summary.missingOnChain.length +
      summary.missingInDb.length +
      summary.listingDrift.length;
    process.exit(issues === 0 ? 0 : 1);
  }

  const code = printSummary(summary);
  process.exit(code);
}

// Only run when executed directly (not imported as a module in tests).
const isMain = process.argv[1]?.endsWith("reconcile.ts") || process.argv[1]?.endsWith("reconcile.js");
if (isMain) {
  main();
}
