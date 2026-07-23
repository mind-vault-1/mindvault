/**
 * Contract binding version/interface check.
 *
 * Verifies that the installed `@mindvault/registry-client` bindings match the
 * interface of the deployed `vault-registry` contract. The bindings embed a
 * contract spec (the function set they were generated against); the deployed
 * contract exposes its own spec on-chain. Comparing the two catches the common
 * failure where the bindings and the deployed contract have drifted apart —
 * e.g. after a redeploy without regenerating bindings, or vice versa.
 *
 * The comparison and message formatting are pure (deterministic, no I/O). Only
 * {@link fetchDeployedMethodNames} touches the network, and it is injectable via
 * {@link BindingCheckOptions.fetchContractMethods} so the orchestration can be
 * tested without RPC access. Nothing here handles secrets — contract IDs,
 * network names, RPC URLs, and method names are all public.
 */

import { Networks } from "@stellar/stellar-sdk";
import { Client as ContractClient } from "@stellar/stellar-sdk/contract";
import { Client } from "./generated/index.js";
import { networks } from "./networks.js";

/** Version of the installed bindings, surfaced in mismatch warnings. */
export const REGISTRY_CLIENT_VERSION = "0.1.0";

// Any valid-format contract ID works for reading the bindings' embedded spec —
// no network call is made — so we use a fixed, well-formed placeholder.
const SPEC_PROBE_CONTRACT_ID = "CDQKUIADLO5S5WEHEUTTXX2M45WAHVRU2PBEBD6ZGDKMOP5A72FJ3OD4";

export interface BindingComparison {
  compatible: boolean;
  /** Methods the bindings expect that the deployed contract does not expose. */
  missingFromContract: string[];
  /** Methods the deployed contract exposes that the bindings do not know about. */
  missingFromBindings: string[];
}

export interface DeployedMethodsQuery {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
}

export interface BindingCheckOptions {
  contractId: string;
  rpcUrl: string;
  networkPassphrase?: string;
  /** Human-readable network label used in messages (e.g. "testnet"). */
  network?: string;
  /** Injectable deployed-method fetcher (defaults to {@link fetchDeployedMethodNames}). */
  fetchContractMethods?: (query: DeployedMethodsQuery) => Promise<string[]>;
  /** Override the binding method set (defaults to the installed bindings' spec). */
  bindingMethods?: string[];
}

export interface BindingCheckResult {
  /** True only when the interfaces match exactly. */
  ok: boolean;
  status: "match" | "mismatch" | "error";
  /** Deterministic, agent-safe message describing the outcome. */
  message: string;
  comparison?: BindingComparison;
}

/** Sorted method names exposed by the installed registry-client bindings. */
export function getBindingMethodNames(): string[] {
  // The spec is embedded in the generated Client constructor; the options only
  // need to be well-formed (no network call is made to read the spec).
  const client = new Client({
    contractId: SPEC_PROBE_CONTRACT_ID,
    rpcUrl: networks.testnet.sorobanRpcUrl,
    networkPassphrase: networks.testnet.networkPassphrase,
  });
  return client.spec
    .funcs()
    .map((fn) => fn.name().toString())
    .sort();
}

/** Sorted method names of the deployed contract, read from its on-chain spec. */
export async function fetchDeployedMethodNames(query: DeployedMethodsQuery): Promise<string[]> {
  const deployed = await ContractClient.from({
    contractId: query.contractId,
    rpcUrl: query.rpcUrl,
    networkPassphrase: query.networkPassphrase,
  });
  return deployed.spec
    .funcs()
    .map((fn) => fn.name().toString())
    .sort();
}

/** Diff two method sets, reporting drift in both directions. */
export function compareMethodSets(
  bindingMethods: string[],
  contractMethods: string[],
): BindingComparison {
  const bindingSet = new Set(bindingMethods);
  const contractSet = new Set(contractMethods);
  const missingFromContract = bindingMethods.filter((m) => !contractSet.has(m)).sort();
  const missingFromBindings = contractMethods.filter((m) => !bindingSet.has(m)).sort();
  return {
    compatible: missingFromContract.length === 0 && missingFromBindings.length === 0,
    missingFromContract,
    missingFromBindings,
  };
}

export interface BindingReportContext {
  contractId: string;
  network: string;
  rpcUrl: string;
  clientVersion: string;
  comparison: BindingComparison;
}

/** Render a deterministic report for a comparison (match or mismatch). */
export function formatBindingCheck(ctx: BindingReportContext): string {
  const { contractId, network, rpcUrl, clientVersion, comparison } = ctx;

  if (comparison.compatible) {
    return [
      `registry-client bindings match the deployed contract interface.`,
      `Contract: ${contractId}`,
      `Network: ${network}`,
      `Client version: ${clientVersion}`,
    ].join("\n");
  }

  const lines = [
    `WARNING: registry-client bindings do not match the deployed contract interface.`,
    `Contract: ${contractId}`,
    `Network: ${network}`,
    `RPC: ${rpcUrl}`,
    `Client version: ${clientVersion}`,
  ];
  if (comparison.missingFromContract.length > 0) {
    lines.push(
      `Bindings expect methods the deployed contract is missing: ${comparison.missingFromContract.join(", ")}`,
      `  → The deployed contract is older than these bindings. Redeploy vault-registry from the current contract source, or point VAULT_REGISTRY_CONTRACT_ID at the up-to-date deployment.`,
    );
  }
  if (comparison.missingFromBindings.length > 0) {
    lines.push(
      `Deployed contract exposes methods the bindings lack: ${comparison.missingFromBindings.join(", ")}`,
      `  → The bindings are stale. Regenerate them with 'pnpm contract:bindings' and rebuild @mindvault/registry-client.`,
    );
  }
  return lines.join("\n");
}

/**
 * Compare the installed bindings against the deployed contract and return a
 * deterministic, agent-safe result. Network/RPC failures are caught and turned
 * into a `status: "error"` message rather than thrown, so callers (an MCP tool
 * or a startup check) never surface an opaque stack trace.
 */
export async function checkContractBindings(
  options: BindingCheckOptions,
): Promise<BindingCheckResult> {
  const network = options.network ?? "unknown";
  const clientVersion = REGISTRY_CLIENT_VERSION;
  const networkPassphrase = options.networkPassphrase ?? Networks.TESTNET;
  const bindingMethods = options.bindingMethods ?? getBindingMethodNames();
  const fetchMethods = options.fetchContractMethods ?? fetchDeployedMethodNames;

  let contractMethods: string[];
  try {
    contractMethods = await fetchMethods({
      contractId: options.contractId,
      rpcUrl: options.rpcUrl,
      networkPassphrase,
    });
  } catch (err) {
    return {
      ok: false,
      status: "error",
      message: [
        `Could not verify registry-client bindings against the deployed contract.`,
        `Contract: ${options.contractId}`,
        `Network: ${network}`,
        `RPC: ${options.rpcUrl}`,
        `Client version: ${clientVersion}`,
        `Reason: ${err instanceof Error ? err.message : String(err)}`,
        `The contract may be unreachable, not deployed at this ID, or the RPC may be down. Bindings were not validated.`,
      ].join("\n"),
    };
  }

  const comparison = compareMethodSets(bindingMethods, contractMethods);
  const message = formatBindingCheck({
    contractId: options.contractId,
    network,
    rpcUrl: options.rpcUrl,
    clientVersion,
    comparison,
  });
  return {
    ok: comparison.compatible,
    status: comparison.compatible ? "match" : "mismatch",
    message,
    comparison,
  };
}
