/**
 * `mindvault://server/status` — the server's network and capability metadata
 * as an MCP resource (#1064).
 *
 * An agent that wants to know which network it is about to spend on, which
 * registry contract it is talking to, or whether the tool surface it cached is
 * still current had to call a tool (`mindvault_network_profile`,
 * `mindvault_registry_info`) to find out. This resource answers the same
 * questions with a plain `resources/read`, which is side-effect free by
 * definition and needs no tool permission.
 *
 * Contract:
 *
 *  - **Read-only.** It is built from the live configuration on every read;
 *    nothing in it can be written through MCP.
 *  - **Current.** Switching profile or network changes what the next read
 *    returns, and a client subscribed to the URI is sent
 *    `notifications/resources/updated` when it changes.
 *  - **Safe.** No secret keys, API keys, wallet addresses, profile names
 *    (which are free-form and can name a person), or RPC/Horizon URLs (which
 *    can carry a provider key). Wallet state is reduced to booleans.
 */
import { createHash } from "node:crypto";

import type { Resource, TextResourceContents } from "@modelcontextprotocol/sdk/types.js";

export const SERVER_STATUS_URI = "mindvault://server/status";
export const SERVER_STATUS_MIME = "application/json";
export const SERVER_STATUS_SCHEMA = "mindvault.server-status/v1";

/** A tool as it appears in ListTools, reduced to what defines its contract. */
export interface CapabilityTool {
  name: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
}

/** Everything the status is built from. Callers pass live values per read. */
export interface ServerStatusInput {
  serverName: string;
  serverVersion: string;
  /** `testnet` or `mainnet`. */
  stellarNetwork: string;
  /** CAIP-2 id used for x402 payments, e.g. `stellar:testnet`. */
  x402Network: string;
  registryContractId: string;
  networkPassphrase: string;
  /** The tools ListTools currently advertises. */
  tools: CapabilityTool[];
  readOnly: boolean;
  mock: boolean;
  walletConfigured: boolean;
  publisherRegistered: boolean;
}

export interface ServerStatus {
  schema: typeof SERVER_STATUS_SCHEMA;
  server: { name: string; version: string };
  network: { stellarNetwork: string; x402Network: string; mainnet: boolean };
  registry: { contractId: string; networkPassphrase: string };
  capabilities: { toolCapabilityVersion: string; toolCount: number };
  status: {
    mode: "live" | "mock";
    readOnly: boolean;
    walletConfigured: boolean;
    publisherRegistered: boolean;
  };
}

/** JSON with object keys sorted, so equal values always serialize equally. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * A stable version for the advertised tool surface: `sha256:` plus the first
 * 16 hex chars of a hash over each tool's name, input and output schema, and
 * annotations, in name order. It changes exactly when a tool is added,
 * removed, or changes its contract — so an agent can tell whether a cached
 * tool list is still valid — and is identical across restarts otherwise.
 * Descriptions are left out: rewording a description is not a contract change.
 */
export function toolCapabilityVersion(tools: CapabilityTool[]): string {
  const surface = [...tools]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(({ name, inputSchema, outputSchema, annotations }) => ({
      name,
      inputSchema,
      outputSchema,
      annotations,
    }));
  const digest = createHash("sha256").update(canonicalJson(surface)).digest("hex");
  return `sha256:${digest.slice(0, 16)}`;
}

export function buildServerStatus(input: ServerStatusInput): ServerStatus {
  return {
    schema: SERVER_STATUS_SCHEMA,
    server: { name: input.serverName, version: input.serverVersion },
    network: {
      stellarNetwork: input.stellarNetwork,
      x402Network: input.x402Network,
      mainnet: input.stellarNetwork === "mainnet",
    },
    registry: {
      contractId: input.registryContractId,
      networkPassphrase: input.networkPassphrase,
    },
    capabilities: {
      toolCapabilityVersion: toolCapabilityVersion(input.tools),
      toolCount: input.tools.length,
    },
    status: {
      mode: input.mock ? "mock" : "live",
      readOnly: input.readOnly,
      walletConfigured: input.walletConfigured,
      publisherRegistered: input.publisherRegistered,
    },
  };
}

/** The `resources/list` entry for the status resource. */
export function serverStatusResource(): Resource {
  return {
    uri: SERVER_STATUS_URI,
    name: "MindVault server status",
    description:
      "Read-only: active Stellar network, registry contract ID, tool capability version, and operational status. Contains no secrets or wallet addresses; changes after a profile or network switch.",
    mimeType: SERVER_STATUS_MIME,
  };
}

/** The `resources/read` contents for the status resource. */
export function serverStatusContents(input: ServerStatusInput): TextResourceContents {
  return {
    uri: SERVER_STATUS_URI,
    mimeType: SERVER_STATUS_MIME,
    text: JSON.stringify(buildServerStatus(input), null, 2),
  };
}

/**
 * Tracks `resources/subscribe` for the status URI and tells the caller when to
 * send `notifications/resources/updated`: call `snapshot()` before a tool runs
 * and `changedSince(before)` after it, and notify when that returns true and
 * a client is subscribed.
 */
export function createServerStatusWatcher(read: () => TextResourceContents) {
  let subscribed = false;
  return {
    subscribe(uri: string): boolean {
      if (uri !== SERVER_STATUS_URI) return false;
      subscribed = true;
      return true;
    },
    unsubscribe(uri: string): boolean {
      if (uri !== SERVER_STATUS_URI) return false;
      subscribed = false;
      return true;
    },
    get subscribed(): boolean {
      return subscribed;
    },
    snapshot(): string {
      return read().text;
    },
    /** True when a subscribed client should be told the status changed. */
    changedSince(before: string): boolean {
      return subscribed && read().text !== before;
    },
  };
}
