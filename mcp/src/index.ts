#!/usr/bin/env node
/**
 * MindVault MCP Server
 * Exposes vault tools to AI agents via the Model Context Protocol.
 */

import {
  networks as registryNetworks,
  normalizeX402Network,
  resolveStellarNetwork,
  validateNetworkConfig,
  X402_NETWORK_IDS,
  type Resource,
} from "@mindvault/registry-client";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";

// ── Config ────────────────────────────────────────────────────────────────────

const STELLAR_NETWORK = resolveStellarNetwork(process.env.STELLAR_NETWORK);
const networkPreset = registryNetworks[STELLAR_NETWORK];

const networkIssues = validateNetworkConfig({
  stellarNetwork: STELLAR_NETWORK,
  x402Network: process.env.NETWORK ?? networkPreset.x402Network,
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL ?? networkPreset.sorobanRpcUrl,
  horizonUrl: process.env.HORIZON_URL ?? networkPreset.horizonUrl,
  usdcSacContractId: process.env.USDC_CONTRACT_ID ?? networkPreset.usdcSacContractId,
  registryContractId:
    process.env.VAULT_REGISTRY_CONTRACT_ID ?? networkPreset.defaultRegistryContractId ?? undefined,
});

if (networkIssues.length > 0) {
  const details = networkIssues.map((i) => `${i.field}: ${i.message}`).join("\n");
  console.error(`MindVault MCP: inconsistent network configuration:\n${details}`);
  process.exit(1);
}

const BASE_URL = process.env.MINDVAULT_URL ?? "https://mindvault-hyr3.onrender.com";
const REGISTRY_CONTRACT_ID =
  process.env.VAULT_REGISTRY_CONTRACT_ID ?? networkPreset.defaultRegistryContractId ?? "";
const REGISTRY_NETWORK_PASSPHRASE = networkPreset.networkPassphrase;
const SPONSORED_ACCOUNT_URL =
  process.env.SPONSORED_ACCOUNT_URL ?? "https://stellar-sponsored-agent-account.onrender.com";
const HORIZON_URL = process.env.HORIZON_URL ?? networkPreset.horizonUrl;
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL ?? networkPreset.sorobanRpcUrl;
type X402Network = (typeof X402_NETWORK_IDS)[keyof typeof X402_NETWORK_IDS];
const NETWORK: X402Network = normalizeX402Network(
  process.env.NETWORK ?? networkPreset.x402Network,
) as X402Network;

if (!REGISTRY_CONTRACT_ID) {
  console.error(
    "MindVault MCP: VAULT_REGISTRY_CONTRACT_ID is required for mainnet. Deploy vault-registry and set the contract ID.",
  );
  process.exit(1);
}

// ── In-memory agent state ─────────────────────────────────────────────────────

interface AgentWallet {
  publicKey: string;
  secretKey: string;
}

let agentWallet: AgentWallet | null = null;
let agentApiKey: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function jsonFetch(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

function requireWallet(): AgentWallet {
  if (!agentWallet) throw new Error("No wallet. Run mindvault_setup_wallet first.");
  return agentWallet;
}

function makePaidFetch(wallet: AgentWallet) {
  const signer = createEd25519Signer(wallet.secretKey, NETWORK);
  const scheme = new ExactStellarScheme(signer);
  const client = new x402Client().register(NETWORK, scheme);
  return wrapFetchWithPayment(fetch, client);
}

async function getUsdcBalance(publicKey: string): Promise<string> {
  const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`);
  if (!res.ok) return "0";
  const data: any = await res.json();
  const b = (data.balances ?? []).find(
    (b: any) => b.asset_type === "credit_alphanum4" && b.asset_code === "USDC",
  );
  return b?.balance ?? "0";
}

function formatResource(r: any): string {
  return `[${r.id}] ${r.title} — $${r.price} USDC\n  ${r.description ?? ""}\n  ${r.accessUrl}`;
}

interface SearchFilters {
  query: string;
  minPrice?: string;
  maxPrice?: string;
  verificationStatus?: "pending" | "verified" | "rejected" | "skipped";
  resourceType?: "file" | "link";
}

function normalizeSearchFilters(args: any): SearchFilters | null {
  const query = typeof args?.query === "string" ? args.query.trim() : "";
  if (!query) return null;

  const minPrice = typeof args?.minPrice === "string" ? args.minPrice.trim() : "";
  const maxPrice = typeof args?.maxPrice === "string" ? args.maxPrice.trim() : "";
  const verificationStatus =
    args?.verificationStatus === "pending" ||
    args?.verificationStatus === "verified" ||
    args?.verificationStatus === "rejected" ||
    args?.verificationStatus === "skipped"
      ? args.verificationStatus
      : undefined;
  const resourceType = args?.resourceType === "file" || args?.resourceType === "link" ? args.resourceType : undefined;

  return {
    query,
    minPrice: minPrice || undefined,
    maxPrice: maxPrice || undefined,
    verificationStatus,
    resourceType,
  };
}

function describeFilters(filters: SearchFilters): string {
  const hasExtra = filters.minPrice || filters.maxPrice || filters.verificationStatus || filters.resourceType;
  if (!hasExtra) {
    return `"${filters.query}"`;
  }
  const parts = [`query "${filters.query}"`];
  if (filters.minPrice) parts.push(`min $${filters.minPrice}`);
  if (filters.maxPrice) parts.push(`max $${filters.maxPrice}`);
  if (filters.verificationStatus) parts.push(`status ${filters.verificationStatus}`);
  if (filters.resourceType) parts.push(`type ${filters.resourceType}`);
  return parts.join(", ");
}

/**
 * Compares the agent wallet's USDC balance against an amount it is about to
 * spend. Returns an actionable insufficient-funds message (balance, amount
 * needed, and the shortfall) when the wallet can't cover the cost, or null
 * when the balance is sufficient.
 */
async function insufficientFundsMessage(
  wallet: AgentWallet,
  amountNeeded: string | number,
  action: string,
): Promise<string | null> {
  const need = typeof amountNeeded === "number" ? amountNeeded : parseFloat(amountNeeded);
  if (!Number.isFinite(need)) return null;
  const balance = await getUsdcBalance(wallet.publicKey);
  const have = parseFloat(balance);
  if (!Number.isFinite(have) || have >= need) return null;
  const shortfall = need - have;
  return [
    `Insufficient USDC to ${action}.`,
    `Amount needed: ${need} USDC`,
    `Current balance: ${have} USDC`,
    `Shortfall: ${shortfall.toFixed(7).replace(/\.?0+$/, "")} USDC`,
    `Fund ${wallet.publicKey} with the shortfall and retry.`,
  ].join("\n");
}

async function txStatus(txHash: string): Promise<string> {
  const res = await fetch(SOROBAN_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: { hash: txHash },
    }),
  });
  if (!res.ok) throw new Error(`Soroban RPC error: ${res.status}`);
  const data: any = await res.json();
  if (data.error) throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  const tx = data.result;
  return JSON.stringify(
    {
      status: tx.status,
      hash: txHash,
      ledger: tx.ledger,
      ledgerCloseTime: tx.createdAt ? new Date(tx.createdAt * 1000).toISOString() : null,
      applicationOrder: tx.applicationOrder,
      feeBump: tx.feeBump,
      envelopeXdr: tx.envelopeXdr,
      resultXdr: tx.resultXdr,
      resultMetaXdr: tx.resultMetaXdr,
    },
    null,
    2,
  );
}

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function setupWallet(): Promise<string> {
  const res = await jsonFetch(`${SPONSORED_ACCOUNT_URL}/create`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to create wallet: ${JSON.stringify(res.data)}`);
  agentWallet = { publicKey: res.data.publicKey, secretKey: res.data.secretKey };
  return `Wallet created.\nAddress: ${agentWallet.publicKey}\nSecret key stored in memory (not persisted).`;
}

async function walletInfo(): Promise<string> {
  const wallet = requireWallet();
  const balance = await getUsdcBalance(wallet.publicKey);
  return `Address: ${wallet.publicKey}\nUSDC Balance: ${balance}`;
}

export async function browse(): Promise<string> {
  const res = await jsonFetch(`${BASE_URL}/resources`);
  if (!res.ok) throw new Error(`Browse failed: ${JSON.stringify(res.data)}`);
  const items: any[] = res.data;
  if (items.length === 0) return "No resources listed yet.";
  return items.map(formatResource).join("\n\n");
}

export async function search(filtersOrQuery: string | SearchFilters): Promise<string> {
  const filters: SearchFilters = typeof filtersOrQuery === "string"
    ? { query: filtersOrQuery }
    : filtersOrQuery;

  if (!filters.query.trim()) return "Provide a non-empty search query.";
  const queryParams = new URLSearchParams();
  queryParams.set("search", filters.query);
  if (filters.minPrice) queryParams.set("minPrice", filters.minPrice);
  if (filters.maxPrice) queryParams.set("maxPrice", filters.maxPrice);
  if (filters.verificationStatus) queryParams.set("verificationStatus", filters.verificationStatus);
  if (filters.resourceType) queryParams.set("resourceType", filters.resourceType);

  const res = await jsonFetch(`${BASE_URL}/resources?${queryParams.toString()}`);
  if (!res.ok) throw new Error(`Search failed: ${JSON.stringify(res.data)}`);
  let items: any[] = res.data;

  // Filter client-side as well for unit tests compatibility
  const q = filters.query.trim().toLowerCase();
  items = items.filter((r) =>
    `${r.title ?? ""} ${r.description ?? ""}`.toLowerCase().includes(q)
  );

  if (items.length === 0) return `No resources match ${describeFilters(filters)}.`;
  return items.map(formatResource).join("\n\n");
}

export async function preview(resourceId: string): Promise<string> {
  const res = await jsonFetch(`${BASE_URL}/resources/${resourceId}/meta`);
  if (!res.ok) throw new Error(`Preview failed: ${JSON.stringify(res.data)}`);
  const r = res.data;
  return JSON.stringify(
    {
      id: r.id,
      title: r.title,
      description: r.description,
      price: `$${r.price} USDC`,
      type: r.resourceType,
      verificationStatus: r.verificationStatus,
      accessUrl: r.accessUrl,
    },
    null,
    2,
  );
}

async function register(name: string, email: string, walletAddress?: string): Promise<string> {
  const wallet = requireWallet();
  const res = await jsonFetch(`${BASE_URL}/publishers`, {
    method: "POST",
    body: JSON.stringify({ name, email, walletAddress: walletAddress ?? wallet.publicKey }),
  });
  if (!res.ok) throw new Error(`Register failed: ${JSON.stringify(res.data)}`);
  agentApiKey = res.data.apiKey;
  return `Registered as publisher.\nID: ${res.data.id}\nAPI key stored in memory.`;
}

async function publish(args: {
  title: string;
  description?: string;
  price: string;
  externalUrl: string;
}): Promise<string> {
  const wallet = requireWallet();
  if (!agentApiKey) throw new Error("Not registered. Run mindvault_register first.");

  // Step 1: Create the resource record
  const createRes = await jsonFetch(`${BASE_URL}/resources`, {
    method: "POST",
    headers: { "x-api-key": agentApiKey },
    body: JSON.stringify({
      title: args.title,
      description: args.description,
      price: args.price,
      externalUrl: args.externalUrl,
    }),
  });
  if (!createRes.ok) throw new Error(`Publish failed: ${JSON.stringify(createRes.data)}`);
  const resource = createRes.data;

  // Step 2: Agent wallet signs the x402 payment for verification. Check funds
  // first so a shortfall returns an actionable message rather than a created-
  // but-unverifiable resource with an opaque payment error.
  const statusRes = await jsonFetch(`${BASE_URL}/agent/status`);
  const verificationPrice = statusRes.ok ? statusRes.data?.agent?.pricePerVerification : null;
  if (verificationPrice != null) {
    const shortMsg = await insufficientFundsMessage(
      wallet,
      verificationPrice,
      "pay the content verification fee",
    );
    if (shortMsg) {
      return `${shortMsg}\n(Resource created with id ${resource.id}; verify it later once funded.)`;
    }
  }

  const paidFetch = makePaidFetch(wallet);

  const verifyRes = await paidFetch(`${BASE_URL}/verify-content`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `Title: ${args.title}\nDescription: ${args.description ?? ""}\nURL: ${args.externalUrl}`,
      resourceId: resource.id,
    }),
  });

  const verifyData = await verifyRes.json().catch(() => null);

  if (!verifyRes.ok) {
    return (
      `Resource created (id: ${resource.id}) but verification payment failed.\n` +
      `Status: ${verifyRes.status}\n${JSON.stringify(verifyData)}`
    );
  }

  const isOriginal: boolean = verifyData?.isOriginal ?? false;
  const flags: string[] = verifyData?.flags ?? [];

  if (!isOriginal) {
    return [
      `Resource created but rejected by verification.`,
      `ID: ${resource.id}`,
      `Verification: rejected ✗`,
      flags.length ? `Flags: ${flags.join("; ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  // Step 3: Trigger on-chain registration (best-effort — failure doesn't block listing)
  const registerRes = await jsonFetch(`${BASE_URL}/resources/${resource.id}/register`, {
    method: "POST",
    headers: { "x-api-key": agentApiKey },
  });

  const onchainStatus: string = registerRes.ok
    ? (registerRes.data.onchainStatus ?? "registered")
    : "failed";
  const onchainTxHash: string | null = registerRes.ok
    ? (registerRes.data.onchainTxHash ?? null)
    : null;

  return [
    `Resource published.`,
    `ID: ${resource.id}`,
    `Access URL: ${resource.accessUrl}`,
    `Verification: approved ✓`,
    `On-chain status: ${onchainStatus}`,
    onchainTxHash ? `On-chain tx: ${onchainTxHash}` : null,
    !registerRes.ok
      ? `(Registration failed — resource is still listed and purchasable. Retry with mindvault_register_onchain.)`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function buy(resourceId: string): Promise<string> {
  const wallet = requireWallet();

  // Check the wallet can cover the price before attempting payment so a
  // shortfall returns an actionable message instead of an opaque payment error.
  const meta = await jsonFetch(`${BASE_URL}/resources/${resourceId}/meta`);
  if (meta.ok && meta.data?.price != null) {
    const shortMsg = await insufficientFundsMessage(
      wallet,
      meta.data.price,
      `buy "${meta.data.title ?? resourceId}"`,
    );
    if (shortMsg) return shortMsg;
  }

  const paidFetch = makePaidFetch(wallet);
  const res = await paidFetch(`${BASE_URL}/resources/${resourceId}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Buy failed [${res.status}]: ${text}`);
  }
  return JSON.stringify(await res.json(), null, 2);
}

async function agentStatus(): Promise<string> {
  const res = await jsonFetch(`${BASE_URL}/agent/status`);
  if (!res.ok) throw new Error(`Agent status failed: ${JSON.stringify(res.data)}`);
  return JSON.stringify(res.data, null, 2);
}

function registryInfo(): string {
  const info: {
    contractId: string;
    networkPassphrase: string;
    rpcUrl: string;
    resourceFields: (keyof Resource)[];
  } = {
    contractId: REGISTRY_CONTRACT_ID,
    networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
    rpcUrl: SOROBAN_RPC_URL,
    resourceFields: ["id", "creator", "price", "metadata", "listed"],
  };
  return JSON.stringify(info, null, 2);
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server({ name: "mindvault", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "mindvault_setup_wallet",
      description: "Create a Stellar wallet using the sponsored account protocol.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "mindvault_wallet_info",
      description: "Check the agent wallet address and USDC balance.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "mindvault_browse",
      description: "List all available resources in the MindVault catalog.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "mindvault_search",
      description:
        "Search the MindVault catalog by keyword and optional filters for price, resource type, and verification status. Uses server-side filtering and returns compact resource summaries.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keyword(s) to match against resource title or description." },
          minPrice: { type: "string", description: "Minimum USDC price to include." },
          maxPrice: { type: "string", description: "Maximum USDC price to include." },
          verificationStatus: {
            type: "string",
            enum: ["pending", "verified", "rejected", "skipped"],
            description: "Filter by verification status.",
          },
          resourceType: {
            type: "string",
            enum: ["file", "link"],
            description: "Filter by resource type.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "mindvault_preview",
      description: "Get details and price for a specific resource.",
      inputSchema: {
        type: "object",
        properties: { resourceId: { type: "string" } },
        required: ["resourceId"],
      },
    },
    {
      name: "mindvault_register",
      description: "Register as a publisher using the agent wallet.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          walletAddress: { type: "string" },
        },
        required: ["name", "email"],
      },
    },
    {
      name: "mindvault_publish",
      description:
        "Publish a link resource. Agent wallet signs the x402 verification payment on-chain.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          price: { type: "string" },
          externalUrl: { type: "string" },
        },
        required: ["title", "price", "externalUrl"],
      },
    },
    {
      name: "mindvault_buy",
      description: "Pay USDC via x402 and access a resource.",
      inputSchema: {
        type: "object",
        properties: { resourceId: { type: "string" } },
        required: ["resourceId"],
      },
    },
    {
      name: "mindvault_agent_status",
      description: "Check the verification agent's earnings and activity.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "mindvault_registry_info",
      description:
        "Return the on-chain vault-registry contract ID and network so you can query ownership, price, and listing state directly from Stellar without trusting the MindVault API.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "mindvault_tx_status",
      description:
        "Look up the status of a Stellar transaction by hash via Soroban RPC. Returns SUCCESS, FAILED, or NOT_FOUND along with ledger details and XDR.",
      inputSchema: {
        type: "object",
        properties: { txHash: { type: "string" } },
        required: ["txHash"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    let result: string;
    switch (name) {
      case "mindvault_setup_wallet":
        result = await setupWallet();
        break;
      case "mindvault_wallet_info":
        result = await walletInfo();
        break;
      case "mindvault_browse":
        result = await browse();
        break;
      case "mindvault_search": {
        const filters = normalizeSearchFilters(args);
        if (!filters) {
          result = "Provide a non-empty search query.";
        } else {
          result = await search(filters);
        }
        break;
      }
      case "mindvault_preview":
        result = await preview(args.resourceId as string);
        break;
      case "mindvault_register":
        result = await register(
          args.name as string,
          args.email as string,
          args.walletAddress as string | undefined,
        );
        break;
      case "mindvault_publish":
        result = await publish({
          title: args.title as string,
          description: args.description as string | undefined,
          price: args.price as string,
          externalUrl: args.externalUrl as string,
        });
        break;
      case "mindvault_buy":
        result = await buy(args.resourceId as string);
        break;
      case "mindvault_agent_status":
        result = await agentStatus();
        break;
      case "mindvault_registry_info":
        result = registryInfo();
        break;
      case "mindvault_tx_status":
        result = await txStatus(args.txHash as string);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: result }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
