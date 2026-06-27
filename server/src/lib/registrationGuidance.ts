import { networks, resolveStellarNetwork } from "@mindvault/registry-client";
import { config } from "../config.js";

const explorerNetwork = networks[resolveStellarNetwork(config.STELLAR_NETWORK)].explorerNetwork;

/** Stellar Explorer URL for a transaction hash on the configured network. */
export function explorerTxUrl(txHash: string): string {
  return `https://stellar.expert/explorer/${explorerNetwork}/tx/${txHash}`;
}

export interface RegistrationFailureGuidance {
  /** Short, human-readable summary of what happened. */
  message: string;
  /** Ordered, actionable next steps the creator/agent can follow. */
  nextSteps: string[];
  /** The endpoint to call to retry registration. */
  retryEndpoint: string;
  /** Whether retrying is expected to help. */
  retryable: boolean;
  /** Explorer link to inspect the transaction, present only when a hash exists. */
  txStatusUrl?: string;
}

/**
 * Build user-facing guidance for a failed or stuck on-chain registration.
 *
 * The guidance distinguishes the likely cause from whether a transaction hash
 * exists: a hash means a transaction was broadcast (so it may be pending or
 * failed on-chain and worth inspecting on the explorer), while no hash means
 * submission never happened (more likely a funding, signing, or RPC problem).
 */
export function buildRegistrationFailureGuidance(params: {
  resourceId: string;
  txHash?: string | null;
  detail?: string | null;
}): RegistrationFailureGuidance {
  const { resourceId, txHash, detail } = params;
  const retryEndpoint = `POST /resources/${resourceId}/register`;
  const hasHash = Boolean(txHash);
  const isTimeout = Boolean(detail && /timeout|pending|status unknown/i.test(detail));

  const nextSteps: string[] = [];

  if (hasHash) {
    nextSteps.push(
      `Check the transaction status on Stellar Explorer: ${explorerTxUrl(txHash as string)}`,
    );
    if (isTimeout) {
      nextSteps.push(
        "The transaction was submitted but did not confirm in time. If the explorer shows it as pending, wait a minute and re-check before retrying — it may still succeed.",
      );
    } else {
      nextSteps.push(
        "If the explorer shows the transaction FAILED, the most common cause is the signing account lacking XLM for fees — fund it, then retry.",
      );
    }
  } else {
    nextSteps.push(
      "No transaction was submitted. Confirm your wallet is connected and funded with XLM for network fees, and that the Soroban RPC endpoint is reachable.",
    );
  }

  nextSteps.push(
    `Retry by calling ${retryEndpoint} again. The resource is still listed and purchasable while registration is retried.`,
  );
  nextSteps.push(
    "If retries keep failing, contact a MindVault operator with the resource ID" +
      (hasHash ? " and transaction hash above." : "."),
  );

  return {
    message: hasHash
      ? "On-chain registration did not confirm. A transaction was broadcast — inspect it before retrying."
      : "On-chain registration could not be submitted. This usually means a funding, signing, or RPC issue.",
    nextSteps,
    retryEndpoint,
    retryable: true,
    ...(hasHash ? { txStatusUrl: explorerTxUrl(txHash as string) } : {}),
  };
}
