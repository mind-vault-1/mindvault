/// <reference path="../types/freighter.d.ts" />
/**
 * In-browser x402 purchase flow (issue #219).
 *
 * Wraps `fetch` with the x402 client so a `GET /resources/:id` that returns 402
 * is automatically retried with a Freighter-signed USDC payment. The wallet
 * never exposes its secret key — instead we build a SEP-43 `ClientStellarSigner`
 * that delegates auth-entry / transaction signing to the Freighter extension.
 *
 * @see docs/x402-browser-payment-walkthrough.md
 */
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import type { Network } from "@x402/fetch";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import type { ClientStellarSigner } from "@x402/stellar";
import { networks, type NetworkPreset } from "@mindvault/registry-client";
import { explorerTxUrl } from "./stellarExplorer.js";

/** Resolve the deployment network the web app targets (defaults to testnet). */
function resolveNetworkPreset(): NetworkPreset {
  const raw = (import.meta.env.VITE_STELLAR_NETWORK as string | undefined)?.trim().toLowerCase();
  if (raw === "public" || raw === "mainnet" || raw === "pubnet") return networks.mainnet;
  return networks.testnet;
}

/** Turn a Freighter error object into a readable, actionable message. */
function freighterErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

/**
 * Build a SEP-43 client signer backed by Freighter. Both signing methods default
 * to the app's configured network passphrase when the scheme doesn't pass one,
 * and surface Freighter's own error messages (rejected signature, locked wallet)
 * rather than swallowing them.
 */
export function createFreighterSigner(
  address: string,
  networkPassphrase: string,
): ClientStellarSigner {
  return {
    address,
    signAuthEntry: async (authEntry, opts) => {
      // Dynamically imported to match the codebase convention and keep the
      // Freighter bundle out of the main chunk.
      const { signAuthEntry } = await import("@stellar/freighter-api");
      const res = await signAuthEntry(authEntry, {
        networkPassphrase: opts?.networkPassphrase ?? networkPassphrase,
        address: opts?.address ?? address,
      });
      if (res.error) throw new Error(freighterErrorMessage(res.error, "Failed to sign payment."));
      if (res.signedAuthEntry == null) {
        throw new Error("Freighter returned no signed authorization entry.");
      }
      return { signedAuthEntry: res.signedAuthEntry, signerAddress: res.signerAddress };
    },
    signTransaction: async (xdr, opts) => {
      const { signTransaction } = await import("@stellar/freighter-api");
      const res = await signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? networkPassphrase,
        address: opts?.address ?? address,
      });
      if (res.error) {
        throw new Error(freighterErrorMessage(res.error, "Failed to sign transaction."));
      }
      return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress };
    },
  };
}

/** A receipt returned by a paid link resource. */
export interface PurchaseReceipt {
  paymentId?: string;
  amount?: string;
  currency?: string;
  paidTo?: string;
  paidAt?: string;
}

export interface PurchaseResult {
  /** External URL for link resources, when the resource is a link. */
  url?: string;
  /** Receipt details echoed by the server (link resources). */
  receipt?: PurchaseReceipt;
  /** Object URL + filename for file resources the buyer can download. */
  download?: { objectUrl: string; filename: string };
  /** On-chain settlement tx hash, when the facilitator reported one. */
  txHash?: string;
  /** Stellar Explorer link for `txHash`, when available. */
  explorerUrl?: string;
}

/** A purchase failure carrying the HTTP status so the UI can be specific. */
export class PurchaseError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "PurchaseError";
    this.status = status;
  }
}

/** The network passphrase the purchase flow expects Freighter to be on. */
export function expectedNetworkPassphrase(): string {
  return resolveNetworkPreset().networkPassphrase;
}

/** Map common purchase failures to actionable guidance. */
function describeFailure(status: number, detail?: string): string {
  if (status === 402) {
    return (
      detail ??
      "Payment was not accepted. The authorization may have expired or your USDC balance is too low — refresh and try again."
    );
  }
  if (status === 409) {
    return detail ?? "The resource price changed on-chain. Reload the catalog and try again.";
  }
  if (status === 503) {
    return detail ?? "The price could not be verified on-chain right now. Try again in a moment.";
  }
  return detail ?? `Purchase failed (HTTP ${status}).`;
}

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = /filename="?([^"]+)"?/.exec(disposition);
  return match?.[1] ?? fallback;
}

/**
 * Buy a resource through the x402 paywall using the connected Freighter wallet.
 *
 * @param accessUrl - The resource's paywalled `accessUrl` (`GET /resources/:id`).
 * @param address - The connected wallet's public key (the payer).
 * @returns The delivered content plus, when available, the settlement tx hash.
 * @throws {PurchaseError} On payment, network, or delivery failure.
 */
export async function purchaseResource(
  accessUrl: string,
  address: string,
): Promise<PurchaseResult> {
  const preset = resolveNetworkPreset();
  const signer = createFreighterSigner(address, preset.networkPassphrase);
  const client = new x402Client().register(
    preset.x402Network as Network,
    new ExactStellarScheme(signer),
  );
  const paidFetch = wrapFetchWithPayment(fetch, client);

  let res: Response;
  try {
    res = await paidFetch(accessUrl, { headers: { Accept: "application/json" } });
  } catch (err) {
    // wrapFetchWithPayment throws on signing/build failures (rejected signature, etc.).
    throw new PurchaseError(err instanceof Error ? err.message : "Payment could not be completed.");
  }

  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = (await res.json())?.error;
    } catch {
      detail = undefined;
    }
    throw new PurchaseError(describeFailure(res.status, detail), res.status);
  }

  // Best-effort settlement tx hash from the x402 response header.
  let txHash: string | undefined;
  const settleHeader = res.headers.get("x-payment-response");
  if (settleHeader) {
    try {
      const settle = decodePaymentResponseHeader(settleHeader);
      if (settle?.transaction) txHash = settle.transaction;
    } catch {
      // Header present but undecodable — purchase still succeeded; skip the link.
    }
  }
  const explorerUrl = txHash ? explorerTxUrl(txHash) : undefined;

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await res.json();
    return { url: body?.url, receipt: body?.receipt, txHash, explorerUrl };
  }

  // File resource: hand back a downloadable object URL.
  const blob = await res.blob();
  const filename = filenameFromDisposition(
    res.headers.get("content-disposition"),
    accessUrl.split("/").pop() ?? "resource",
  );
  return { download: { objectUrl: URL.createObjectURL(blob), filename }, txHash, explorerUrl };
}
