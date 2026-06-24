import { networks, type ExplorerNetwork } from "@mindvault/registry-client";

export type StellarNetwork = ExplorerNetwork;

function resolveExplorerNetwork(): StellarNetwork {
  const raw = (import.meta.env.VITE_STELLAR_NETWORK as string | undefined)?.trim().toLowerCase();
  if (!raw) return networks.testnet.explorerNetwork;
  if (raw === "public" || raw === "mainnet" || raw === "pubnet") {
    return networks.mainnet.explorerNetwork;
  }
  if (raw === "testnet") return networks.testnet.explorerNetwork;
  return networks.testnet.explorerNetwork;
}

// Defaults to testnet; set VITE_STELLAR_NETWORK=testnet|mainnet|public for explorer links.
const NETWORK: StellarNetwork = resolveExplorerNetwork();

const EXPLORER_BASE = `https://stellar.expert/explorer/${NETWORK}`;

/** Stellar Explorer URL for a transaction hash. */
export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER_BASE}/tx/${txHash}`;
}

/** Stellar Explorer URL for an account / wallet address (G...). */
export function explorerAccountUrl(address: string): string {
  return `${EXPLORER_BASE}/account/${address}`;
}

/** Stellar Explorer URL for a Soroban contract id (C...). */
export function explorerContractUrl(contractId: string): string {
  return `${EXPLORER_BASE}/contract/${contractId}`;
}
