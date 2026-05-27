import { Keypair, Networks, contract } from "@stellar/stellar-sdk";
import { config } from "../config.js";

export interface Resource {
  creator: string;
  id: string;
  metadata: string;
  price: bigint;
}

const NETWORK_PASSPHRASE =
  config.NETWORK === "stellar:testnet"
    ? Networks.TESTNET
    : Networks.PUBLIC;

const keypair = Keypair.fromSecret(config.REGISTRY_SECRET_KEY);

const clientOptions: contract.ClientOptions = {
  contractId: config.REGISTRY_CONTRACT_ID,
  networkPassphrase: NETWORK_PASSPHRASE,
  rpcUrl: config.SOROBAN_RPC_URL,
  publicKey: keypair.publicKey(),
  ...contract.basicNodeSigner(keypair, NETWORK_PASSPHRASE),
};

export const registryClient = await contract.Client.from(clientOptions);

export { NETWORK_PASSPHRASE, keypair as registryKeypair };

/**
 * Fetch a resource from the on-chain vault registry.
 * Returns the parsed Resource (creator, price, metadata) or null if not found.
 */
export async function getResource(id: string): Promise<Resource | null> {
  const tx = await registryClient.get({ id });
  const result = tx.result;
  if (result.isErr()) {
    if (result.unwrapErr() === 2) return null; // NotFound
    throw new Error(`Contract error: ${result.unwrapErr()}`);
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
  return tx.result;
}
