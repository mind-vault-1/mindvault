import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import {
  Client,
  Errors,
  listResources,
  networkPassphraseForX402,
  type Resource,
} from "@mindvault/registry-client";
import { config } from "../config.js";
import { getLogger } from "../lib/logger.js";

const NETWORK_PASSPHRASE = networkPassphraseForX402(config.NETWORK);

const keypair = Keypair.fromSecret(config.REGISTRY_SECRET_KEY);

export const registryClient = new Client({
  contractId: config.REGISTRY_CONTRACT_ID,
  rpcUrl: config.SOROBAN_RPC_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
  publicKey: keypair.publicKey(),
});

export { NETWORK_PASSPHRASE, keypair as registryKeypair };
export type { Resource };

/**
 * Fetch a resource from the on-chain vault registry.
 * Returns the parsed Resource (creator, price, metadata) or null if not found.
 */
export async function getResource(id: string): Promise<Resource | null> {
  const tx = await registryClient.get({ id });
  const result = tx.result;
  if (result.isErr()) {
    const err = result.unwrapErr();
    if (err.message === Errors[2].message) return null; // NotFound
    throw new Error(`Contract error: ${err.message}`);
  }
  return result.unwrap();
}

/**
 * Check whether a resource with the given id is registered on-chain.
 */
export async function resourceExists(id: string): Promise<boolean> {
  const tx = await registryClient.exists({ id });
  return tx.result;
}

export async function getResourcePage(start: number, limit: number): Promise<Resource[]> {
  return listResources(registryClient, start, limit);
}

/**
 * Total number of resources ever registered on-chain.
 */
export async function resourceCount(): Promise<number> {
  const tx = await registryClient.count();
  return Number(tx.result);
}

/**
 * Convert a USDC decimal string (e.g. "0.50") to i128 stroops.
 * Stellar USDC uses 7 decimal places: 1 USDC = 10_000_000 stroops.
 */
export function usdcToStroops(usdc: string): bigint {
  return BigInt(Math.round(parseFloat(usdc) * 10_000_000));
}

/**
 * Build an unsigned set_price transaction for the resource owner to sign.
 * Returns the transaction XDR string.
 */
export async function setPrice(id: string, newPriceUsdc: string): Promise<string> {
  const tx = await (registryClient as any).set_price(
    { id, new_price: usdcToStroops(newPriceUsdc) },
    { simulate: false },
  );
  return tx.toXDR();
}

/**
 * Build an unsigned transfer_ownership transaction for the resource owner to sign.
 * Returns the transaction XDR string.
 */
export async function transferOwnership(id: string, newCreator: string): Promise<string> {
  const tx = await (registryClient as any).transfer_ownership(
    { id, new_creator: newCreator },
    { simulate: false },
  );
  return tx.toXDR();
}

/**
 * Build an unsigned register transaction for the resource creator to sign.
 * Returns the transaction XDR string.
 */
export async function buildRegisterTx(
  creator: string,
  id: string,
  priceUsdc: string,
  metadata: string,
): Promise<string> {
  const tx = await (registryClient as any).register(
    {
      creator,
      id,
      price: usdcToStroops(priceUsdc),
      metadata,
      tags: [],
    },
    { simulate: false },
  );
  return tx.toXDR();
}

/**
 * Submit a creator-signed XDR to Soroban RPC and poll for the result.
 * Returns the transaction hash and success/failure status.
 */
export async function submitSignedTx(signedXdr: string): Promise<{
  txHash: string;
  success: boolean;
  error?: string;
}> {
  try {
    // Validate the signed transaction parses before submission
    TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

    // Submit to Soroban RPC
    const server = registryClient.options.rpcUrl;
    const response = await fetch(server, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: {
          transaction: signedXdr,
        },
      }),
    });

    const result = await response.json();

    if (result.error) {
      getLogger().warn(
        {
          event: "onchain_submit",
          phase: "send",
          success: false,
          error: result.error.message || "Transaction submission failed",
        },
        "signed transaction submission failed",
      );
      return {
        txHash: "",
        success: false,
        error: result.error.message || "Transaction submission failed",
      };
    }

    const txHash = result.result.hash;
    getLogger().info(
      { event: "onchain_submit", phase: "sent", txHash },
      "signed transaction submitted",
    );

    // Poll for transaction result with timeout
    const maxAttempts = 30; // 30 seconds timeout
    const pollInterval = 1000; // 1 second

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const statusResponse = await fetch(server, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: {
            hash: txHash,
          },
        }),
      });

      const statusResult = await statusResponse.json();

      if (statusResult.error) {
        // Transaction not found yet, continue polling
        continue;
      }

      const status = statusResult.result.status;

      if (status === "SUCCESS") {
        getLogger().info(
          { event: "onchain_submit", phase: "confirmed", txHash, success: true },
          "signed transaction confirmed on-chain",
        );
        return {
          txHash,
          success: true,
        };
      } else if (status === "FAILED") {
        getLogger().warn(
          { event: "onchain_submit", phase: "confirmed", txHash, success: false },
          "signed transaction failed on-chain",
        );
        return {
          txHash,
          success: false,
          error: "Transaction failed on-chain",
        };
      }
      // If status is still PENDING, continue polling
    }

    // Timeout reached
    getLogger().warn(
      { event: "onchain_submit", phase: "timeout", txHash, success: false },
      "signed transaction confirmation timed out",
    );
    return {
      txHash,
      success: false,
      error: "Transaction polling timeout - status unknown",
    };
  } catch (error) {
    getLogger().error(
      { event: "onchain_submit", phase: "error", err: error },
      "signed transaction submit failed",
    );
    return {
      txHash: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
