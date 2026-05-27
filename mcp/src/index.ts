#!/usr/bin/env node
/**
 * MindVault MCP Server
 * Exposes vault tools to AI agents via the Model Context Protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.MINDVAULT_URL ?? "https://mindvault-hyr3.onrender.com";
const SPONSORED_ACCOUNT_URL =
  process.env.SPONSORED_ACCOUNT_URL ??
  "https://stellar-sponsored-agent-account.onrender.com";
const HORIZON_URL =
  process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const NETWORK = "stellar:testnet";

// ── In-memory agent state ─────────────────────────────────────────────────────

interface AgentWallet {
  publicKey: string;
  secretKey: string;
}

let agentWallet: AgentWallet | null = null;
let agentApiKey: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function jsonFetch(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
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
    (b: any) => b.asset_type === "credit_alphanum4" && b.asset_code === "USDC"
  );
  return b?.balance ?? "0";
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

async function browse(): Promise<string> {
  const res = await jsonFetch(`${BASE_URL}/resources`);
  if (!res.ok) throw new Error(`Browse failed: ${JSON.stringify(res.data)}`);
  const items: any[] = res.data;
  if (items.length === 0) return "No resources listed yet.";
  return items
    .map((r) => `[${r.id}] ${r.title} — $${r.price} USDC\n  ${r.description ?? ""}\n  ${r.accessUrl}`)
    .join("\n\n");
}

async function preview(resourceId: string): Promise<string> {
  const res = await jsonFetch(`${BASE_URL}/resources/${resourceId}/meta`);
  if (!res.ok) throw new Error(`Preview failed: ${JSON.stringify(res.data)}`);
  const r = res.data;
  return JSON.stringify(
    { id: r.id, title: r.title, description: r.description, price: `$${r.price} USDC`, type: r.resourceType, verificationStatus: r.verificationStatus, accessUrl: r.accessUrl },
    null, 2
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

  // Step 2 + 3: Agent wallet signs the x402 payment for verification.
  // wrapFetchWithPayment intercepts the 402, signs a Soroban USDC auth entry
  // using the agent's Ed25519 key, and retries with the payment header.
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

  return [
    `Resource published.`,
    `ID: ${resource.id}`,
    `Access URL: ${resource.accessUrl}`,
    `Verification: ${isOriginal ? "approved ✓" : "rejected ✗"}`,
    flags.length ? `Flags: ${flags.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function buy(resourceId: string): Promise<string> {
  const wallet = requireWallet();
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

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "mindvault", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "mindvault_setup_wallet", description: "Create a Stellar wallet using the sponsored account protocol.", inputSchema: { type: "object", properties: {}, required: [] } },
    { name: "mindvault_wallet_info", description: "Check the agent wallet address and USDC balance.", inputSchema: { type: "object", properties: {}, required: [] } },
    { name: "mindvault_browse", description: "List all available resources in the MindVault catalog.", inputSchema: { type: "object", properties: {}, required: [] } },
    { name: "mindvault_preview", description: "Get details and price for a specific resource.", inputSchema: { type: "object", properties: { resourceId: { type: "string" } }, required: ["resourceId"] } },
    { name: "mindvault_register", description: "Register as a publisher using the agent wallet.", inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, walletAddress: { type: "string" } }, required: ["name", "email"] } },
    { name: "mindvault_publish", description: "Publish a link resource. Agent wallet signs the x402 verification payment on-chain.", inputSchema: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, price: { type: "string" }, externalUrl: { type: "string" } }, required: ["title", "price", "externalUrl"] } },
    { name: "mindvault_buy", description: "Pay USDC via x402 and access a resource.", inputSchema: { type: "object", properties: { resourceId: { type: "string" } }, required: ["resourceId"] } },
    { name: "mindvault_agent_status", description: "Check the verification agent's earnings and activity.", inputSchema: { type: "object", properties: {}, required: [] } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    let result: string;
    switch (name) {
      case "mindvault_setup_wallet": result = await setupWallet(); break;
      case "mindvault_wallet_info":  result = await walletInfo(); break;
      case "mindvault_browse":       result = await browse(); break;
      case "mindvault_preview":      result = await preview(args.resourceId as string); break;
      case "mindvault_register":     result = await register(args.name as string, args.email as string, args.walletAddress as string | undefined); break;
      case "mindvault_publish":      result = await publish({ title: args.title as string, description: args.description as string | undefined, price: args.price as string, externalUrl: args.externalUrl as string }); break;
      case "mindvault_buy":          result = await buy(args.resourceId as string); break;
      case "mindvault_agent_status": result = await agentStatus(); break;
      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: result }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
