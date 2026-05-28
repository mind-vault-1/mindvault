import { Keypair, Networks } from "@stellar/stellar-sdk";
import { Client, Errors, type Resource } from "@mindvault/registry-client";
import { config } from "../config.js";

const NETWORK_PASSPHRASE =
  config.NETWORK === "stellar:testnet"
    ? Networks.TESTNET
    : Networks.PUBLIC;

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

/**
 * Total number of resources ever registered on-chain.
 */
export async function resourceCount(): Promise<number> {
  const tx = await registryClient.count();
  return Number(tx.result);
}
