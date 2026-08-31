#!/usr/bin/env node
/**
 * MindVault MCP Server
 * Exposes vault tools to AI agents via the Model Context Protocol.
 */

import {
  checkContractBindings,
  createRegistryClient,
  Errors as RegistryErrors,
  listResources,
  type Resource,
} from "@mindvault/registry-client";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { listCatalogResources, readCatalogResource } from "./catalogResources.js";
import { PROMPT_DEFINITIONS, getPrompt } from "./prompts.js";
import { createProgressEmitter } from "./progress.js";
import { truncateResponse } from "./truncation.js";
import { applyPreviewLimits, serializePreview } from "./previewLimits.js";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { cacheStalenessNotice } from "./cacheStaleness.js";
import { buildConfig, resolveConfig } from "./config.js";
import {
  assertMainnetMutationAllowed,
  formatMainnetDiagnostics,
  mainnetAllowedFromEnv,
} from "./mainnetGuardrails.js";
import { assertPaidOperationConfirmed } from "./paidOperations.js";
import { assertToolAllowedInReadOnlyMode } from "./readOnlyMode.js";
import {
  createMetricsRecorder,
  measureTool,
  metricsEnabledFromEnv,
  resolveToolDurationBudget,
} from "./metrics.js";
import {
  createMockFetch,
  mockEnabledFromEnv,
  mockRegistryLookup,
  mockRegistryList,
  mockUpdateMetadata,
  mockSetPrice,
  mockTransferOwnership,
  mockSetListed,
} from "./mock.js";
import { purchaseHistoryTool, recordPurchase } from "./purchaseHistory.js";
import { Mutex } from "./mutex.js";
import { exportReceiptsTool } from "./receipts.js";
import { normalizeToolResult, outcomeText, type ToolOutcome } from "./toolResult.js";
import { advertisedTools, hasOutputSchema } from "./toolSurface.js";
import { dryRunPublish, dryRunBuy } from "./dryRun.js";
import { initAuditLogging } from "./auditLog.js";
import { REGISTRY_LIST_DEFAULT_LIMIT, REGISTRY_LIST_DEFAULT_START } from "./registryPagination.js";
import {
  flag,
  optionalInt,
  optionalString,
  requiredString,
  TOOL_ARGUMENT_SPECS,
  TOOLS_WITHOUT_ARG_VALIDATION,
  UnknownToolError,
  validateToolArgs,
  type ValidatedArgs,
} from "./validation.js";
import {
  DEFAULT_PROFILE,
  isValidProfileName,
  migrateState,
  STATE_VERSION,
  type AgentWallet,
  type ProfileState,
  type WalletProfile,
} from "./profiles.js";
import {
  buildPublishStatusSnapshot,
  normalizeIntervalMs,
  normalizeTimeoutMs,
  normalizeWaitFlag,
  pollPublishStatus,
  type PublishProgressReporter,
  type PublishStatusFetch,
} from "./publishStatus.js";
import { type ApiResponse } from "./apiResponse.js";
import { safeErrorMessage, safeLog } from "./redaction.js";
import { assertAutoPaymentWithinCeiling } from "./paymentCeiling.js";
import { signMutatingHeaders } from "./requestSignature.js";
import {
  exportState,
  restoreState,
  checkStatePermissions,
  preserveLegacyState,
  quarantineStateFile,
  writeAtomically,
} from "./stateBackup.js";
import { formatResetPreview, isResetConfirmed, type ResetScope } from "./resetGuard.js";
import { verifyInstall, formatVerifyInstall } from "./verifyInstall.js";
import {
  describeTimeouts,
  fetchWithTimeout,
  resolveTimeouts,
  resolveUserAgent,
  withTimeout,
  type TimeoutService,
} from "./httpTimeout.js";
import {
  describeRetryPolicy,
  formatRetryLog,
  isIdempotentMethod,
  isRetryableStatus,
  retryAfterDelay,
  retryPolicyFromEnv,
  withRetry,
  type RetryAttemptInfo,
} from "./retry.js";
import {
  mapHttpError,
  mapRegistryError,
  mapTransportError,
  mappedErrorOf,
  mcpError,
  troubleshootingHint,
  throwHttpError,
  isTimeoutError,
  type CredentialContext,
  type ErrorSource,
} from "./errorMapping.js";
import {
  mapSponsoredHttpFailure,
  mapSponsoredTransportFailure,
  SPONSORED_CREATE_PATH,
} from "./sponsoredDiagnostics.js";
import { parseMetadataHash } from "./metadataHash.js";
import {
  applyCatalogSort,
  applyClientCatalogFilters,
  buildCatalogQueryString,
  describeCatalogFilters,
  parseCatalogFilters,
  type CatalogFilters,
} from "./catalogFilters.js";
import {
  catalogCacheLabel,
  getCatalogSnapshot,
  getPreviewSnapshot,
  recordCatalogSnapshot,
  recordPreviewSnapshot,
} from "./catalogCache.js";

// ── Config ────────────────────────────────────────────────────────────────────

// Network, URL, and contract-id resolution lives in ./config.ts as a pure,
// unit-tested function so the config path no longer runs as an untestable
// top-level side effect. The named aliases below keep the rest of this file
// unchanged.
const {
  stellarNetwork: STELLAR_NETWORK,
  networkPreset,
  x402Network: NETWORK,
  baseUrl: BASE_URL,
  registryContractId: REGISTRY_CONTRACT_ID,
  registryNetworkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
  sponsoredAccountUrl: SPONSORED_ACCOUNT_URL,
  horizonUrl: HORIZON_URL,
  sorobanRpcUrl: SOROBAN_RPC_URL,
} = buildConfig(process.env);

// Startup diagnostics: collect every configuration problem in one pass so the
// operator sees the full list (with exact variable names and expected values)
// instead of fixing them one failed launch at a time. `resolveConfig` returns
// the validation result rather than exiting; the fail-fast decision stays here.
// Warnings are printed but non-fatal; any error stops the server. Skipped under
// tests and in mock mode so unit runs and offline local development never exit.
if (!process.env.VITEST && !mockEnabledFromEnv(process.env)) {
  const startup = resolveConfig(process.env);
  if (startup.report) console.error(startup.report);
  if (!startup.ok) process.exit(1);
}

const metrics = createMetricsRecorder(
  metricsEnabledFromEnv(process.env),
  resolveToolDurationBudget(process.env),
);

initAuditLogging(process.env);

const MOCK = mockEnabledFromEnv(process.env);
function _isMock(): boolean {
  return mockEnabledFromEnv(process.env);
}
export function _setMockMode(on: boolean): void {
  if (on) process.env.MINDVAULT_MOCK = "1";
  else delete process.env.MINDVAULT_MOCK;
}
const httpFetch: typeof fetch = MOCK
  ? createMockFetch(() => currentWallet()?.publicKey)
  : (input, init) => fetch(input as RequestInfo | URL, init);

const TIMEOUTS = resolveTimeouts(process.env);

const RETRY_POLICY = retryPolicyFromEnv(process.env);

const USER_AGENT = resolveUserAgent(process.env);

const logRetry = process.env.VITEST
  ? undefined
  : (info: RetryAttemptInfo) => console.error(`MindVault MCP: ${formatRetryLog(info)}`);

function httpRetryOptions(label: string) {
  return {
    policy: RETRY_POLICY,
    label,
    shouldRetryResult: (res: Response) => isRetryableStatus(res.status),
    describeResult: (res: Response) => `HTTP ${res.status}`,
    delayFromResult: (res: Response) =>
      retryAfterDelay(res.headers?.get?.("retry-after"), RETRY_POLICY),
    onRetry: logRetry,
  };
}

function sorobanRpcFetch(init: RequestInit, label: string): Promise<Response> {
  const initWithUA: RequestInit = {
    ...init,
    headers: { "User-Agent": USER_AGENT, ...(init.headers as Record<string, string> | undefined) },
  };
  return withRetry(
    () => fetchWithTimeout(httpFetch, SOROBAN_RPC_URL, initWithUA, "soroban", TIMEOUTS.soroban),
    httpRetryOptions(label),
  );
}

// ── State persistence ─────────────────────────────────────────────────────────

const STATE_DIR = join(homedir(), ".mindvault");
const STATE_FILE = join(STATE_DIR, "state.json");

let profiles: Record<string, WalletProfile> = {};
let activeProfileName: string = DEFAULT_PROFILE;

function activeProfile(): WalletProfile {
  return (profiles[activeProfileName] ??= {});
}

function currentWallet(): AgentWallet | null {
  return profiles[activeProfileName]?.wallet ?? null;
}

function currentApiKey(): string | null {
  return profiles[activeProfileName]?.apiKey ?? null;
}

export function _setAgentWallet(w: AgentWallet | null): void {
  if (w) activeProfile().wallet = w;
  else delete activeProfile().wallet;
}
export function _setAgentApiKey(k: string | null): void {
  if (k) activeProfile().apiKey = k;
  else delete activeProfile().apiKey;
}
export function _resetProfiles(): void {
  profiles = {};
  activeProfileName = DEFAULT_PROFILE;
}

function applyRestoredState(state: ProfileState): void {
  profiles = state.profiles;
  activeProfileName = state.activeProfile;
  saveState();
}

export function backupState(passphrase: string): string {
  const blob = exportState(passphrase);
  return [
    "Encrypted state backup ready. Copy the blob below to the new environment.",
    "Restore with mindvault_restore_state using the same passphrase.",
    "The blob does not contain plaintext secrets.",
    "",
    blob,
  ].join("\n");
}

export function restoreStateTool(blob: string, passphrase: string): string {
  return restoreState(blob, passphrase, applyRestoredState);
}

function quarantineCorruptState(reason: string, detail: string): void {
  try {
    const quarantined = quarantineStateFile(STATE_FILE);
    console.error(
      `MindVault MCP: state file ${STATE_FILE} ${reason} and was quarantined to ${quarantined}; ` +
        `starting fresh.${detail ? ` ${detail}` : ""}`,
    );
  } catch (err) {
    console.error(
      `MindVault MCP: state file ${STATE_FILE} ${reason}; starting fresh ` +
        `(could not quarantine the file: ${safeErrorMessage(err)}).`,
    );
  }
}

function loadState(): void {
  if (!existsSync(STATE_FILE)) return;

  let raw: string;
  try {
    raw = readFileSync(STATE_FILE, "utf-8");
  } catch (err) {
    quarantineCorruptState("could not be read", safeErrorMessage(err));
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    quarantineCorruptState("is not valid JSON", safeErrorMessage(err));
    return;
  }

  const { state, migrated, legacy } = migrateState(parsed);

  if (Object.keys(state.profiles).length === 0) {
    quarantineCorruptState("did not contain a recognisable profile", "");
    return;
  }

  profiles = state.profiles;
  activeProfileName = state.activeProfile;
  if (migrated) {
    try {
      preserveLegacyState(legacy);
    } catch (err) {
      console.error(
        "MindVault MCP: failed to preserve legacy state before migration:",
        safeErrorMessage(err),
      );
    }
    saveState();
  }
}

function persistableProfiles(): Record<string, WalletProfile> {
  const out: Record<string, WalletProfile> = {};
  for (const [name, profile] of Object.entries(profiles)) {
    if (profile.wallet || profile.apiKey || name === activeProfileName) out[name] = profile;
  }
  return out;
}

function saveState(): void {
  try {
    const state: ProfileState = {
      version: STATE_VERSION,
      activeProfile: activeProfileName,
      profiles: persistableProfiles(),
    };
    writeAtomically(STATE_FILE, JSON.stringify(state, null, 2), 0o600);
  } catch (err) {
    console.error("MindVault MCP: failed to persist state:", safeErrorMessage(err));
  }
}

function currentResetScope(all: boolean): ResetScope {
  return {
    all,
    activeProfile: activeProfileName,
    profileNames: Object.keys(profiles),
    hasWallet: !!currentWallet(),
    hasApiKey: !!currentApiKey(),
    stateFile: STATE_FILE,
  };
}

export function resetState(all: boolean, confirm: unknown = false): string {
  if (!isResetConfirmed(confirm)) return formatResetPreview(currentResetScope(all));

  if (all) {
    profiles = {};
    activeProfileName = DEFAULT_PROFILE;
    try {
      if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    } catch (err) {
      return `All profiles cleared from memory. Warning: could not delete state file (${STATE_FILE}): ${err}`;
    }
    return `Reset complete. All profiles removed from memory and disk.\nState file: ${STATE_FILE}`;
  }

  const name = activeProfileName;
  delete profiles[name];
  saveState();
  return [
    `Profile "${name}" cleared (wallet and publisher API key removed).`,
    `Remaining profiles: ${Object.keys(profiles).length}.`,
    `State file: ${STATE_FILE}`,
  ].join("\n");
}

function checkStatePermissionsTool(): string {
  const result = checkStatePermissions();
  const lines = [
    `State file: ${STATE_FILE}`,
    `Exists: ${result.exists}`,
    result.mode ? `Current mode: ${result.mode}` : null,
    `Expected mode: ${result.expectedMode}`,
    `Safe: ${result.isSafe ? "yes" : "no"}`,
    "",
    result.message,
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

interface DependencyStatus {
  name: string;
  ok: boolean;
  message: string;
}

async function checkDependency(
  name: string,
  url: string,
  init?: RequestInit,
): Promise<DependencyStatus> {
  const initWithUA: RequestInit = {
    ...init,
    headers: { "User-Agent": USER_AGENT, ...(init?.headers as Record<string, string> | undefined) },
  };
  try {
    const res = await withRetry(
      () => fetchWithTimeout(httpFetch, url, initWithUA, "http", TIMEOUTS.http),
      httpRetryOptions(`health:${name}`),
    );
    if (res.ok) {
      return { name, ok: true, message: `Reachable (HTTP ${res.status})` };
    }
    return { name, ok: false, message: `Returned HTTP ${res.status}` };
  } catch (err) {
    return { name, ok: false, message: `Unreachable: ${safeErrorMessage(err)}` };
  }
}

async function registryHealth(): Promise<string> {
  const deps: DependencyStatus[] = [];

  deps.push(await checkDependency("MindVault API", `${BASE_URL}/resources`));
  deps.push(await checkDependency("Horizon", `${HORIZON_URL}`));
  deps.push(
    await checkDependency("Soroban RPC", SOROBAN_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getNetwork", params: {} }),
    }),
  );

  if (REGISTRY_CONTRACT_ID) {
    deps.push({
      name: "Registry contract",
      ok: true,
      message: `Contract ID: ${REGISTRY_CONTRACT_ID}`,
    });
  } else {
    deps.push({
      name: "Registry contract",
      ok: false,
      message: "VAULT_REGISTRY_CONTRACT_ID is not set.",
    });
  }

  const expectedNetwork = networkPreset.x402Network;
  const currentNetwork = NETWORK;
  if (currentNetwork === expectedNetwork) {
    deps.push({
      name: "x402 network",
      ok: true,
      message: `Aligned: ${currentNetwork}`,
    });
  } else {
    deps.push({
      name: "x402 network",
      ok: false,
      message: `Mismatch: expected ${expectedNetwork}, got ${currentNetwork}.`,
    });
  }

  const allOk = deps.every((d) => d.ok);
  const lines = deps.map((d) => {
    const icon = d.ok ? "✓" : "✗";
    return `${icon} ${d.name}: ${d.message}`;
  });
  lines.unshift(allOk ? "All dependencies healthy." : "Some dependencies are unhealthy.", "");
  return lines.join("\n");
}

const API_MUTATION_TOOLS = new Set([
  "mindvault_register",
  "mindvault_publish",
  "mindvault_rotate_publisher_key",
]);

async function assertApiReachableFor(toolName: string): Promise<void> {
  const dep = await checkDependency("MindVault API", `${BASE_URL}/resources`);
  if (dep.ok) return;
  throw mcpError({
    source: "api",
    category: "network",
    summary: `${toolName} was not attempted because the MindVault API is not reachable (${dep.message}).`,
    action:
      "Check network connectivity to the MindVault API and retry; if it stays down the mutation cannot succeed, so defer it.",
  });
}

async function importWallet(args: {
  secretKey?: string;
  profile?: string;
  persist?: boolean;
}): Promise<ToolOutcome> {
  const target = resolveProfileName(args.profile);
  const persist = args.persist !== false;

  let secretKey = args.secretKey;
  if (!secretKey) {
    secretKey = process.env.MINDVAULT_AGENT_SECRET;
  }
  if (!secretKey) {
    throw new Error(
      "No secret key provided. Pass secretKey or set MINDVAULT_AGENT_SECRET in the environment.",
    );
  }

  if (!/^S[A-Z2-7]{55}$/.test(secretKey)) {
    throw new Error("Invalid Stellar secret key. Must be S followed by 55 base32 characters.");
  }

  let publicKey: string;
  try {
    const { Keypair } = await import("@stellar/stellar-sdk");
    const keypair = Keypair.fromSecret(secretKey);
    publicKey = keypair.publicKey();
  } catch (err) {
    throw new Error(`Failed to derive public key: ${safeErrorMessage(err)}`);
  }

  if (persist) {
    activeProfileName = target;
    activeProfile().wallet = { publicKey, secretKey };
    saveState();
    return {
      text: [
        `Wallet imported.`,
        `Profile: ${target}`,
        `Address: ${publicKey}`,
        `Wallet persisted to ${STATE_FILE} (mode 0600).`,
      ].join("\n"),
      structured: { profile: target, address: publicKey, persisted: true },
    };
  }

  return {
    text: [
      `Wallet validated (not persisted).`,
      `Address: ${publicKey}`,
      `Pass persist: true to save to the state file.`,
    ].join("\n"),
    structured: { profile: target, address: publicKey, persisted: false },
  };
}

async function rotatePublisherKey(profileArg?: string): Promise<string> {
  const target = resolveProfileName(profileArg);
  const wallet = requireWallet();
  const oldApiKey = profiles[target]?.apiKey;
  if (!oldApiKey) {
    throw new Error(`No publisher API key in profile "${target}". Run mindvault_register first.`);
  }

  const res = await jsonFetch(`${BASE_URL}/publishers/rotate-key`, {
    method: "POST",
    headers: { "x-api-key": oldApiKey },
  });

  if (!res.ok) {
    throwHttpError({
      operation: "Failed to rotate publisher API key",
      source: "api",
      status: res.status,
      data: res.data,
      credential: publisherCredential(target),
    });
  }

  const newApiKey = res.data.apiKey;
  if (typeof newApiKey !== "string" || newApiKey.length === 0) {
    throw new Error("Server returned an empty API key. Contact support.");
  }

  if (!profiles[target]) profiles[target] = {};
  profiles[target].apiKey = newApiKey;
  if (target === activeProfileName) {
    // already active
  } else {
    activeProfileName = target;
  }
  saveState();

  return [
    `Publisher API key rotated.`,
    `Profile: ${target}`,
    `Publisher ID: ${res.data.id ?? "(unknown)"}`,
    `New key persisted to ${STATE_FILE} (not shown).`,
    `The old key has been invalidated server-side.`,
  ].join("\n");
}

function resolveProfileName(name: unknown): string {
  if (name === undefined || name === null || name === "") return activeProfileName;
  if (!isValidProfileName(name)) {
    throw new Error(
      `Invalid profile name. Use 1–64 characters from letters, digits, dot, dash, or underscore.`,
    );
  }
  return name;
}

loadState();

// ── Helpers ───────────────────────────────────────────────────────────────────

function sourceForUrl(url: string): ErrorSource {
  if (url.startsWith(SPONSORED_ACCOUNT_URL)) return "sponsored";
  if (url.startsWith(HORIZON_URL)) return "horizon";
  if (url.startsWith(SOROBAN_RPC_URL)) return "soroban";
  return "api";
}

function timeoutServiceForUrl(url: string): TimeoutService {
  if (url.startsWith(HORIZON_URL)) return "horizon";
  if (url.startsWith(SOROBAN_RPC_URL)) return "soroban";
  return "http";
}

const SERVICE_OPERATION: Record<ErrorSource, string> = {
  api: "MindVault API request failed",
  horizon: "Horizon request failed",
  soroban: "Soroban RPC request failed",
  sponsored: "Sponsored-account request failed",
  x402: "x402 payment request failed",
  registry: "Registry request failed",
};

async function jsonFetch(url: string, init?: RequestInit): Promise<ApiResponse<any>> {
  const method = (init?.method ?? "GET").toUpperCase();
  const body =
    typeof init?.body === "string" ? init.body : init?.body ? JSON.stringify(init.body) : undefined;
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    ...(init?.headers as Record<string, string> | undefined),
  };
  const headers = signMutatingHeaders(url, method, baseHeaders, body);

  let res: Response;
  try {
    const service = timeoutServiceForUrl(url);
    const call = () =>
      fetchWithTimeout(
        httpFetch,
        url,
        { ...init, method, body: body ?? init?.body, headers },
        service,
        TIMEOUTS[service],
      );
    res = isIdempotentMethod(method)
      ? await withRetry(call, httpRetryOptions(`${method} ${new URL(url).pathname}`))
      : await call();
  } catch (err) {
    const source = sourceForUrl(url);
    throw mcpError(mapTransportError({ operation: SERVICE_OPERATION[source], source, error: err }));
  }

  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    responseHeaders[key.toLowerCase()] = value;
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text), headers: responseHeaders };
  } catch {
    return { ok: res.ok, status: res.status, data: text, headers: responseHeaders };
  }
}

function requireWallet(): AgentWallet {
  const wallet = currentWallet();
  if (!wallet) {
    throw new Error(
      `No wallet in profile "${activeProfileName}". Run mindvault_setup_wallet first.`,
    );
  }
  return wallet;
}

function publisherCredential(profile: string = activeProfileName): CredentialContext {
  return { kind: "publisher_api_key", profile };
}

function requireApiKey(): string {
  const apiKey = currentApiKey();
  if (!apiKey) {
    throw new Error(
      `Not registered in profile "${activeProfileName}". Run mindvault_register first.`,
    );
  }
  return apiKey;
}

function makePaidFetch(wallet: AgentWallet) {
  const signer = createEd25519Signer(wallet.secretKey, NETWORK);
  const scheme = new ExactStellarScheme(signer);
  const client = new x402Client().register(NETWORK, scheme);
  return wrapFetchWithPayment(withTimeout(httpFetch, "payment", TIMEOUTS.payment), client);
}

interface BalanceDetails {
  status: "missing" | "no-trustline" | "zero" | "funded";
  xlmBalance: string;
  xlmReserve: string;
  xlmAvailable: string;
  usdcBalance: string;
  message?: string;
}

async function getBalanceDetails(publicKey: string): Promise<BalanceDetails> {
  let res: Response;
  try {
    res = await withRetry(
      () =>
        fetchWithTimeout(
          httpFetch,
          `${HORIZON_URL}/accounts/${publicKey}`,
          { headers: { "User-Agent": USER_AGENT } },
          "horizon",
          TIMEOUTS.horizon,
        ),
      httpRetryOptions("GET horizon /accounts"),
    );
  } catch (err) {
    throw mcpError(
      mapTransportError({
        operation: "Horizon request failed",
        source: "horizon",
        error: err,
      }),
    );
  }

  if (res.status === 404) {
    return {
      status: "missing",
      xlmBalance: "0",
      xlmReserve: "0",
      xlmAvailable: "0",
      usdcBalance: "0",
      message: `Account ${publicKey} does not exist. Fund it with at least 1 XLM to activate.`,
    };
  }

  if (!res.ok) {
    throwHttpError({
      operation: `Horizon error ${res.status}`,
      source: "horizon",
      status: res.status,
      data: await res.text().catch(() => null),
    });
  }

  const data: any = await res.json();
  const balances: any[] = data.balances ?? [];

  const xlmBalance = balances.find((b: any) => b.asset_type === "native");
  const xlm = xlmBalance?.balance ?? "0";

  const subentryCount = data.subentry_count ?? 0;
  const baseReserve = 0.5;
  const entryReserve = 0.5;
  const reserve = baseReserve + subentryCount * entryReserve;
  const available = Math.max(0, parseFloat(xlm) - reserve);

  const usdcBalance = balances.find(
    (b: any) => b.asset_type === "credit_alphanum4" && b.asset_code === "USDC",
  );

  if (!usdcBalance) {
    return {
      status: "no-trustline",
      xlmBalance: xlm,
      xlmReserve: reserve.toFixed(1),
      xlmAvailable: available.toFixed(7),
      usdcBalance: "0",
      message: `USDC trustline not found. Add a USDC trustline to receive payments.`,
    };
  }

  const usdc = usdcBalance.balance ?? "0";
  const usdcFloat = parseFloat(usdc);

  if (usdcFloat === 0) {
    return {
      status: "zero",
      xlmBalance: xlm,
      xlmReserve: reserve.toFixed(1),
      xlmAvailable: available.toFixed(7),
      usdcBalance: usdc,
      message: `USDC balance is zero. Fund the account to use x402 payments.`,
    };
  }

  return {
    status: "funded",
    xlmBalance: xlm,
    xlmReserve: reserve.toFixed(1),
    xlmAvailable: available.toFixed(7),
    usdcBalance: usdc,
  };
}

async function getUsdcBalance(publicKey: string): Promise<string> {
  try {
    const details = await getBalanceDetails(publicKey);
    return details.usdcBalance;
  } catch {
    return "0";
  }
}

async function getAccountBalances(
  publicKey: string,
): Promise<{ usdc: string; native: string; funded: boolean }> {
  const res = await withRetry(
    () =>
      fetchWithTimeout(
        httpFetch,
        `${HORIZON_URL}/accounts/${publicKey}`,
        { headers: { "User-Agent": USER_AGENT } },
        "horizon",
        TIMEOUTS.horizon,
      ),
    httpRetryOptions("GET horizon /accounts"),
  );
  if (!res.ok) return { usdc: "0", native: "0", funded: false };
  const data: any = await res.json();
  const balances: any[] = data.balances ?? [];
  const usdc = balances.find((b) => b.asset_type === "credit_alphanum4" && b.asset_code === "USDC");
  const native = balances.find((b) => b.asset_type === "native");
  return { usdc: usdc?.balance ?? "0", native: native?.balance ?? "0", funded: true };
}

function formatResource(r: any): string {
  return `[${r.id}] ${r.title} — $${r.price} USDC\n  ${r.description ?? ""}\n  ${r.accessUrl}`;
}

function catalogItemStructured(r: any): {
  id: string | null;
  title: string | null;
  price: string | number | null;
  description: string | null;
  accessUrl: string | null;
} {
  return {
    id: r?.id ?? null,
    title: r?.title ?? null,
    price: r?.price ?? null,
    description: r?.description ?? null,
    accessUrl: r?.accessUrl ?? null,
  };
}

function catalogOutcome(items: any[], body: string, notice: string | null): ToolOutcome {
  const full = notice ? `${body}\n\n${notice}` : body;
  const text = truncateResponse(full);
  return {
    text,
    structured: {
      items: items.map(catalogItemStructured),
      notice,
      truncated: text !== full,
    },
  };
}

export type SearchFilters = CatalogFilters;

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

export async function txStatus(txHash: string): Promise<string> {
  const hash = (txHash ?? "").trim();
  if (!hash) return "Provide a transaction hash to look up.";
  const res = await sorobanRpcFetch(
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: { hash },
      }),
    },
    "POST soroban getTransaction",
  );
  if (!res.ok)
    throwHttpError({
      operation: `Soroban RPC error: ${res.status}`,
      source: "soroban",
      status: res.status,
      data: await res.text().catch(() => null),
    });
  const data: any = await res.json();
  if (data.error)
    throw mcpError(
      mapRegistryError({
        operation: "RPC error",
        message: JSON.stringify(data.error),
        source: "soroban",
      }),
    );
  const tx = data.result;
  if (tx.status === "NOT_FOUND") {
    return JSON.stringify(
      {
        status: "NOT_FOUND",
        hash,
        message:
          "Transaction not found on the configured Soroban RPC. It may be unconfirmed, on a different network, or outside the RPC's retention window.",
        oldestLedger: tx.oldestLedger,
        latestLedger: tx.latestLedger,
      },
      null,
      2,
    );
  }
  return JSON.stringify(
    {
      status: tx.status,
      hash,
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

function hasPublicErrorDetail(data: unknown): boolean {
  if (typeof data === "string") return data.trim().length > 0;
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return ["error", "message", "detail", "reason"].some((key) => {
    const value = obj[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function sponsoredAccountErrorData(status: number, data: unknown): unknown {
  if (status >= 500 && !hasPublicErrorDetail(data)) {
    return { message: "internal service error" };
  }
  return data;
}

async function setupWallet(profileArg?: string): Promise<ToolOutcome> {
  const target = resolveProfileName(profileArg);
  const operation = "mindvault_setup_wallet failed to create wallet";

  let res: Awaited<ReturnType<typeof jsonFetch>>;
  try {
    res = await jsonFetch(`${SPONSORED_ACCOUNT_URL}${SPONSORED_CREATE_PATH}`, { method: "POST" });
  } catch (err) {
    const mapped = mappedErrorOf(err);
    if (!mapped) throw err;
    throw mcpError(
      mapSponsoredTransportFailure({ operation, serviceUrl: SPONSORED_ACCOUNT_URL, mapped }),
    );
  }

  if (!res.ok) {
    throw mcpError(
      mapSponsoredHttpFailure({
        operation,
        serviceUrl: SPONSORED_ACCOUNT_URL,
        status: res.status,
        data: res.data,
        headers: res.headers,
      }),
    );
  }
  activeProfileName = target;
  activeProfile().wallet = { publicKey: res.data.publicKey, secretKey: res.data.secretKey };
  saveState();
  const text = [
    `Wallet created.`,
    `Profile: ${target}`,
    `Address: ${res.data.publicKey}`,
    `Wallet persisted to ${STATE_FILE} (mode 0600).`,
  ].join("\n");
  return {
    text,
    structured: { profile: target, address: res.data.publicKey, persisted: true },
  };
}

async function walletInfoOutcome(): Promise<ToolOutcome> {
  const wallet = requireWallet();
  const details = await getBalanceDetails(wallet.publicKey);
  const publisherRegistered = !!currentApiKey();

  const lines = [
    `Profile: ${activeProfileName}`,
    `Address: ${wallet.publicKey}`,
    `XLM Balance: ${details.xlmBalance}`,
    `XLM Reserved: ${details.xlmReserve} (base + subentries)`,
    `XLM Available: ${details.xlmAvailable}`,
    `USDC Balance: ${details.usdcBalance}`,
    `USDC Status: ${details.status}`,
    `Publisher registered: ${publisherRegistered ? "yes" : "no"}`,
  ];

  if (details.message) {
    lines.push(`Note: ${details.message}`);
  }

  return {
    text: lines.join("\n"),
    structured: {
      profile: activeProfileName,
      address: wallet.publicKey,
      xlmBalance: details.xlmBalance,
      xlmReserve: details.xlmReserve,
      xlmAvailable: details.xlmAvailable,
      usdcBalance: details.usdcBalance,
      usdcStatus: details.status,
      publisherRegistered,
      note: details.message ?? null,
    },
  };
}

export async function walletInfo(): Promise<string> {
  return outcomeText(await walletInfoOutcome());
}

/** Switch the active profile, creating it if new. */
function useProfileOutcome(nameArg: string): ToolOutcome {
  if (!isValidProfileName(nameArg)) {
    throw new Error(
      `Invalid profile name. Use 1–64 characters from letters, digits, dot, dash, or underscore.`,
    );
  }
  activeProfileName = nameArg;
  const profile = activeProfile();
  saveState();
  if (profile.wallet) {
    return {
      text: [
        `Active profile: ${nameArg}`,
        `Address: ${profile.wallet.publicKey}`,
        `Publisher registered: ${profile.apiKey ? "yes" : "no"}`,
      ].join("\n"),
      structured: {
        profile: nameArg,
        address: profile.wallet.publicKey,
        publisherRegistered: !!profile.apiKey,
      },
    };
  }
  return {
    text: `Active profile: ${nameArg}\nNo wallet in this profile yet. Run mindvault_setup_wallet to create one.`,
    structured: { profile: nameArg, address: null, publisherRegistered: null },
  };
}

export function useProfile(nameArg: string): string {
  return outcomeText(useProfileOutcome(nameArg));
}

/** List every named profile, marking the active one. Secrets are never shown. */
function listProfilesOutcome(): ToolOutcome {
  const names = Object.keys(profiles).sort();
  const structured = {
    active: activeProfileName,
    profiles: names.map((name) => ({
      name,
      address: profiles[name].wallet ? profiles[name].wallet!.publicKey : null,
      publisherRegistered: !!profiles[name].apiKey,
      active: name === activeProfileName,
    })),
  };
  if (names.length === 0) {
    return {
      text: `No profiles yet. Run mindvault_setup_wallet to create one (default profile: "${DEFAULT_PROFILE}").`,
      structured,
    };
  }
  const lines = names.map((name) => {
    const profile = profiles[name];
    const marker = name === activeProfileName ? "*" : " ";
    const address = profile.wallet ? profile.wallet.publicKey : "(no wallet)";
    const registered = profile.apiKey ? ", registered" : "";
    return `${marker} ${name} — ${address}${registered}`;
  });
  return { text: [`Profiles (* = active):`, ...lines].join("\n"), structured };
}

export function listProfiles(): string {
  return outcomeText(listProfilesOutcome());
}

async function browseOutcome(filters: CatalogFilters = {}): Promise<ToolOutcome> {
  const qs = buildCatalogQueryString(filters);
  const url = qs ? `${BASE_URL}/resources?${qs}` : `${BASE_URL}/resources`;
  let raw: any[] = [];
  let notice: string | null = null;
  try {
    const res = await jsonFetch(url);
    if (!res.ok) {
      throw mcpError(
        mapHttpError({
          operation: "Browse failed",
          source: "api",
          status: res.status,
          data: res.data,
        }),
      );
    }
    raw = Array.isArray(res.data) ? res.data : [];
    recordCatalogSnapshot(raw);
    notice = cacheStalenessNotice(res.headers);
  } catch (err) {
    const snapshot = getCatalogSnapshot();
    if (!snapshot) throw err;
    raw = Array.isArray(snapshot.resources) ? (snapshot.resources as any[]) : [];
    notice = catalogCacheLabel(snapshot.savedAtMs);
  }
  const items: any[] = applyCatalogSort(applyClientCatalogFilters(raw, filters), filters.sort);
  const body =
    items.length === 0
      ? filters.query ||
        filters.minPrice ||
        filters.maxPrice ||
        filters.verificationStatus ||
        filters.resourceType ||
        filters.owner ||
        filters.tags?.length ||
        filters.listed !== undefined
        ? `No resources match ${describeCatalogFilters(filters)}.`
        : "No resources listed yet."
      : items.map(formatResource).join("\n\n");
  return catalogOutcome(items, body, notice);
}

export async function browse(filters: CatalogFilters = {}): Promise<string> {
  return outcomeText(await browseOutcome(filters));
}

async function searchOutcome(filtersOrQuery: string | CatalogFilters): Promise<ToolOutcome> {
  const filters: CatalogFilters =
    typeof filtersOrQuery === "string" ? { query: filtersOrQuery } : filtersOrQuery;

  const hasCriteria = Boolean(
    filters.query?.trim() ||
    filters.minPrice ||
    filters.maxPrice ||
    filters.verificationStatus ||
    filters.resourceType ||
    filters.owner ||
    filters.sort ||
    filters.limit !== undefined ||
    filters.offset !== undefined ||
    (filters.tags && filters.tags.length > 0) ||
    filters.listed !== undefined,
  );
  if (!hasCriteria) {
    return catalogOutcome([], "Provide a search query or at least one catalog filter.", null);
  }

  const qs = buildCatalogQueryString(filters);
  const url = qs ? `${BASE_URL}/resources?${qs}` : `${BASE_URL}/resources`;
  let raw: any[] = [];
  let notice: string | null = null;
  try {
    const res = await jsonFetch(url);
    if (!res.ok) {
      throw mcpError(
        mapHttpError({
          operation: "Search failed",
          source: "api",
          status: res.status,
          data: res.data,
        }),
      );
    }
    raw = Array.isArray(res.data) ? res.data : [];
    recordCatalogSnapshot(raw);
    notice = cacheStalenessNotice(res.headers);
  } catch (err) {
    const snapshot = getCatalogSnapshot();
    if (!snapshot) throw err;
    raw = Array.isArray(snapshot.resources) ? (snapshot.resources as any[]) : [];
    notice = catalogCacheLabel(snapshot.savedAtMs);
  }

  // Client-side keyword / tags / listed / skipped for unit-test compatibility
  // and parity with fields the public catalog schema does not accept.
  const items = applyCatalogSort(applyClientCatalogFilters(raw, filters), filters.sort);

  if (items.length === 0) {
    return catalogOutcome([], `No resources match ${describeCatalogFilters(filters)}.`, notice);
  }
  return catalogOutcome(items, items.map(formatResource).join("\n\n"), notice);
}

export async function search(filtersOrQuery: string | CatalogFilters): Promise<string> {
  return outcomeText(await searchOutcome(filtersOrQuery));
}

/**
 * Fetch one resource's public metadata, recording a snapshot on success and
 * falling back to the last snapshot on transport failure (#556). A
 * reachable-but-error response is surfaced verbatim — the cache only covers the
 * unreachable case.
 */
async function previewData(resourceId: string): Promise<{ r: any; label: string | null }> {
  try {
    const res = await jsonFetch(`${BASE_URL}/resources/${resourceId}/meta`);
    if (!res.ok)
      throwHttpError({
        operation: "Preview failed",
        source: "api",
        status: res.status,
        data: res.data,
      });
    recordPreviewSnapshot(resourceId, res.data);
    return { r: res.data, label: null };
  } catch (err) {
    const snap = getPreviewSnapshot(resourceId);
    // No cached snapshot for this resource — surface the original error.
    if (!snap) throw err;
    return { r: snap.meta as any, label: catalogCacheLabel(snap.savedAtMs) };
  }
}

export async function preview(resourceId: string): Promise<string> {
  const { r, label } = await previewData(resourceId);
  // Publisher-supplied title/description are unbounded at the source, so cap
  // them before serializing rather than truncating the JSON afterwards (#582).
  const out: Record<string, unknown> = applyPreviewLimits({
    id: r.id,
    title: r.title,
    description: r.description,
    price: `$${r.price} USDC`,
    type: r.resourceType,
    verificationStatus: r.verificationStatus,
    accessUrl: r.accessUrl,
  });
  if (label) out.offlineCache = label;
  return serializePreview(out);
}

async function fetchPublishStatusData(resourceId: string): Promise<PublishStatusFetch> {
  const metaRes = await jsonFetch(`${BASE_URL}/resources/${resourceId}/meta`);
  const verRes = await jsonFetch(`${BASE_URL}/resources/${resourceId}/verification`);

  if (metaRes.status === 404 && verRes.status === 404) {
    throw new Error(
      `Resource "${resourceId}" not found. Confirm the id from mindvault_publish or mindvault_browse.`,
    );
  }

  if (!metaRes.ok && metaRes.status !== 404) {
    throw new Error(
      `Publish status meta failed [${metaRes.status}]: ${JSON.stringify(metaRes.data)}`,
    );
  }
  if (!verRes.ok && verRes.status !== 404) {
    throw new Error(
      `Publish status verification failed [${verRes.status}]: ${JSON.stringify(verRes.data)}`,
    );
  }
  if (!metaRes.ok && !verRes.ok) {
    throw new Error(
      `Resource "${resourceId}" not found. Confirm the id from mindvault_publish or mindvault_browse.`,
    );
  }

  return {
    meta: metaRes.ok ? metaRes.data : null,
    verification: verRes.ok ? verRes.data : null,
  };
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function publishStatus(
  args: {
    resourceId?: string;
    wait?: unknown;
    timeoutMs?: unknown;
    intervalMs?: unknown;
  },
  onProgress?: PublishProgressReporter,
): Promise<string> {
  const resourceId = (args.resourceId ?? "").trim();
  if (!resourceId) {
    throw new Error(
      "resourceId is required. Pass the id returned by mindvault_publish (e.g. 'cm7x8y9z').",
    );
  }

  const wait = normalizeWaitFlag(args.wait);
  const timeoutMs = normalizeTimeoutMs(args.timeoutMs);
  const intervalMs = normalizeIntervalMs(args.intervalMs);

  const { data, attempts, timedOut } = await pollPublishStatus({
    resourceId,
    wait,
    timeoutMs,
    intervalMs,
    fetchStatus: fetchPublishStatusData,
    onProgress,
    sleep: sleepMs,
  });

  const snapshot = buildPublishStatusSnapshot(resourceId, data, {
    polled: wait,
    attempts,
    timedOut,
  });
  return JSON.stringify(snapshot, null, 2);
}

async function register(name: string, email: string, walletAddress?: string): Promise<string> {
  const wallet = requireWallet();
  const res = await jsonFetch(`${BASE_URL}/publishers`, {
    method: "POST",
    body: JSON.stringify({ name, email, walletAddress: walletAddress ?? wallet.publicKey }),
  });
  if (!res.ok)
    throwHttpError({
      operation: "Register failed",
      source: "api",
      status: res.status,
      data: res.data,
    });
  activeProfile().apiKey = res.data.apiKey;
  saveState();
  return `Registered as publisher.\nProfile: ${activeProfileName}\nID: ${res.data.id}\nAPI key persisted to ${STATE_FILE} (not shown). Run mindvault_reset to revoke.`;
}

async function publish(args: {
  title: string;
  description?: string;
  price: string;
  externalUrl: string;
  dryRun?: boolean;
}): Promise<string> {
  if (args.dryRun) {
    return JSON.stringify(
      dryRunPublish(args, NETWORK, BASE_URL, !!activeProfile().wallet, !!currentApiKey()),
      null,
      2,
    );
  }

  const wallet = requireWallet();
  const apiKey = requireApiKey();

  const createRes = await jsonFetch(`${BASE_URL}/resources`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: JSON.stringify({
      title: args.title,
      description: args.description,
      price: args.price,
      externalUrl: args.externalUrl,
    }),
  });
  if (!createRes.ok)
    throwHttpError({
      operation: "Publish failed",
      source: "api",
      status: createRes.status,
      data: createRes.data,
      credential: publisherCredential(),
    });
  const resource = createRes.data;

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
  metrics.recordPayment(verifyRes.ok);

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

  const registerRes = await jsonFetch(`${BASE_URL}/resources/${resource.id}/register`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
  });

  const onchainStatus: string = registerRes.ok
    ? (registerRes.data.onchainStatus ?? "registered")
    : "failed";
  const onchainTxHash: string | null = registerRes.ok
    ? (registerRes.data.onchainTxHash ?? null)
    : (((registerRes.data as Record<string, any>)?.txHash as string | undefined) ?? null);

  const failureGuidance: string[] = [];
  if (!registerRes.ok) {
    const data = (registerRes.data ?? {}) as Record<string, any>;
    const retryEndpoint =
      typeof data.retryEndpoint === "string"
        ? data.retryEndpoint
        : `POST ${BASE_URL}/resources/${resource.id}/register`;
    failureGuidance.push(
      `Registration failed — the resource is still listed and purchasable.`,
      typeof data.message === "string" ? data.message : `Detail: ${data.detail ?? "unknown error"}`,
      `Retry endpoint: ${retryEndpoint} (send your x-api-key; no body re-runs server-side registration).`,
    );
    if (typeof data.txStatusUrl === "string") {
      failureGuidance.push(`Transaction status: ${data.txStatusUrl}`);
    } else if (onchainTxHash) {
      failureGuidance.push(`Check transaction ${onchainTxHash} with mindvault_tx_status.`);
    }
    if (Array.isArray(data.nextSteps)) {
      failureGuidance.push("Next steps:", ...data.nextSteps.map((s: string) => `  - ${s}`));
    }
  }

  const summary = {
    before: {
      id: null,
      title: null,
      price: null,
      accessUrl: null,
      verificationStatus: null,
      onchainStatus: null,
    },
    after: {
      id: resource.id,
      title: resource.title,
      price: resource.price,
      accessUrl: resource.accessUrl,
      verificationStatus: "approved",
      onchainStatus,
    },
    changedFields: ["id", "title", "price", "accessUrl", "verificationStatus", "onchainStatus"],
    txHash: onchainTxHash,
    failureGuidance: failureGuidance.length > 0 ? failureGuidance : null,
  };

  return JSON.stringify(summary, null, 2);
}

export async function buy(
  resourceId: string,
  dryRun?: boolean,
  estimatedPrice?: string | null,
  onProgress?: (progress: number, total?: number, message?: string) => Promise<void>,
  maxAutoPayUsdc?: string,
): Promise<string> {
  if (dryRun) {
    return JSON.stringify(
      dryRunBuy(resourceId, NETWORK, BASE_URL, !!activeProfile().wallet, estimatedPrice ?? null),
      null,
      2,
    );
  }

  const wallet = requireWallet();

  await onProgress?.(1, 4, "Validating resource");
  const meta = await jsonFetch(`${BASE_URL}/resources/${resourceId}/meta`);
  if (!meta.ok || meta.data?.price == null) {
    throw new Error(
      "Automatic payment blocked because the resource price could not be determined; no x402 payment was submitted.",
    );
  }
  assertAutoPaymentWithinCeiling({ price: meta.data.price, maxAutoPayUsdc });
  const shortMsg = await insufficientFundsMessage(
    wallet,
    meta.data.price,
    `buy "${meta.data.title ?? resourceId}"`,
  );
  if (shortMsg) return shortMsg;

  const beforeState = meta.ok
    ? {
        id: meta.data.id,
        title: meta.data.title,
        price: meta.data.price,
        accessUrl: meta.data.accessUrl,
        purchased: false,
      }
    : null;

  const paidFetch = makePaidFetch(wallet);
  let res: Response;
  try {
    await onProgress?.(2, 4, "Submitting payment");
    res = await paidFetch(`${BASE_URL}/resources/${resourceId}`);
  } catch (err) {
    metrics.recordPayment(false);
    throw mcpError(mapTransportError({ operation: "Buy failed", source: "x402", error: err }));
  }
  metrics.recordPayment(res.ok);
  if (!res.ok) {
    const text = await res.text();
    throwHttpError({
      operation: `Buy failed [${res.status}]`,
      source: "x402",
      status: res.status,
      data: text,
    });
  }
  const afterData = await res.json();
  const txHash = afterData.txHash || null;
  const receipt =
    afterData.receipt && typeof afterData.receipt === "object" ? afterData.receipt : null;
  const amount =
    (receipt?.amount != null ? String(receipt.amount) : null) ??
    (meta.ok && meta.data?.price != null ? String(meta.data.price) : null) ??
    (afterData.price != null ? String(afterData.price) : "");
  const title =
    (typeof afterData.title === "string" && afterData.title) ||
    (meta.ok && typeof meta.data?.title === "string" ? meta.data.title : undefined);

  await onProgress?.(3, 4, "Recording purchase");
  try {
    recordPurchase({
      resourceId,
      amount,
      network: NETWORK,
      txHash,
      receiptRef: receipt?.paymentId != null ? String(receipt.paymentId) : null,
      ...(title ? { title } : {}),
    });
  } catch (err) {
    console.error("MindVault MCP: failed to persist purchase receipt:", safeErrorMessage(err));
  }

  const summary = {
    before: beforeState,
    after: {
      ...afterData,
      purchased: true,
    },
    changedFields: beforeState ? ["purchased"] : ["id", "title", "price", "accessUrl", "purchased"],
    txHash,
  };

  await onProgress?.(4, 4, "Done");

  return JSON.stringify(summary, null, 2);
}

export async function registerOnchain(
  resourceId: string,
  onProgress?: (progress: number, total?: number, message?: string) => Promise<void>,
): Promise<string> {
  const wallet = requireWallet();
  const apiKey = requireApiKey();
  if (!resourceId) throw new Error("resourceId is required.");

  await onProgress?.(1, 3, "Preparing transaction");
  const prep = await jsonFetch(`${BASE_URL}/resources/${resourceId}/register/prepare`, {
    headers: { "x-api-key": apiKey },
  });
  if (!prep.ok) {
    const mapped = mapHttpError({
      operation: `Could not prepare on-chain registration for "${resourceId}" [${prep.status}]`,
      source: "api",
      status: prep.status,
      data: prep.data,
      credential: publisherCredential(),
    });
    const specific = [
      prep.status === 400 ? "The resource must be verified before it can be registered." : null,
      prep.status === 409
        ? "The resource is already registered on-chain — no action needed."
        : null,
    ].filter(Boolean);
    throw mcpError({
      ...mapped,
      action: [...specific, mapped.action].join(" "),
    });
  }

  const { unsignedXdr, networkPassphrase } = prep.data ?? {};
  if (!unsignedXdr) {
    throw new Error(
      `register/prepare did not return an unsigned transaction: ${JSON.stringify(prep.data)}`,
    );
  }

  await onProgress?.(2, 3, "Signing transaction");
  const { Keypair, Transaction } = await import("@stellar/stellar-sdk");
  const passphrase = networkPassphrase ?? REGISTRY_NETWORK_PASSPHRASE;
  const tx = new Transaction(unsignedXdr, passphrase);
  tx.sign(Keypair.fromSecret(wallet.secretKey));
  const signedXdr = tx.toXDR();

  await onProgress?.(3, 3, "Submitting transaction");
  const submit = await jsonFetch(`${BASE_URL}/resources/${resourceId}/register`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: JSON.stringify({ signedXdr }),
  });
  if (!submit.ok) {
    const txHash =
      submit.data && typeof submit.data === "object"
        ? (submit.data as Record<string, any>).txHash
        : undefined;
    const mapped = mapHttpError({
      operation: `On-chain registration failed for "${resourceId}" [${submit.status}]`,
      source: "api",
      status: submit.status,
      data: submit.data,
      credential: publisherCredential(),
    });
    throw mcpError({
      ...mapped,
      action: [
        "The resource remains listed and purchasable.",
        "Ensure the agent wallet is funded for fees and retry.",
        txHash ? `Tx hash: ${txHash} (check with mindvault_tx_status).` : null,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  const summary = {
    before: {
      id: resourceId,
      onchainStatus: null,
      txHash: null,
    },
    after: {
      id: resourceId,
      onchainStatus: submit.data.onchainStatus ?? "registered",
      txHash: submit.data.txHash ?? null,
    },
    changedFields: ["onchainStatus", "txHash"],
    txHash: submit.data.txHash ?? null,
  };

  return JSON.stringify(summary, null, 2);
}

async function agentStatus(): Promise<string> {
  const res = await jsonFetch(`${BASE_URL}/agent/status`);
  if (!res.ok)
    throwHttpError({
      operation: "Agent status failed",
      source: "api",
      status: res.status,
      data: res.data,
    });
  return JSON.stringify(res.data, null, 2);
}

function stroopsToUsdc(stroops: bigint): string {
  const STROOPS_PER_USDC = 10_000_000n;
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOPS_PER_USDC;
  const frac = abs % STROOPS_PER_USDC;
  return `${negative ? "-" : ""}${whole}.${frac.toString().padStart(7, "0")}`;
}

export function usdcToStroops(usdc: string): bigint {
  const parts = usdc.split(".");
  const whole = BigInt(parts[0] || "0");
  const fracStr = (parts[1] || "").padEnd(7, "0").slice(0, 7);
  const frac = BigInt(fracStr);
  return whole * 10_000_000n + frac;
}

export async function updateMetadata(resourceId: string, metadata: string): Promise<string> {
  const wallet = requireWallet();
  if (_isMock()) return mockUpdateMetadata(resourceId, metadata);

  const client = createRegistryClient({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
    publicKey: wallet.publicKey,
  });

  let tx: Awaited<ReturnType<typeof client.update_metadata>>;
  try {
    tx = await client.update_metadata({ id: resourceId, metadata });
  } catch (err: any) {
    if (isTimeoutError(err)) {
      throw mcpError(
        mapTransportError({
          operation: `Update metadata failed for resource "${resourceId}"`,
          source: "soroban",
          error: err,
        }),
      );
    }
    throw mcpError(
      mapRegistryError({
        operation: `Update metadata failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }

  const result = tx.result;
  if (result.isErr()) {
    const err = result.unwrapErr();
    const notFound = err.message === RegistryErrors[2].message;
    throw mcpError(
      mapRegistryError({
        operation: `Update metadata failed for resource "${resourceId}"`,
        message: err.message,
        notFound,
      }),
    );
  }

  const { Keypair } = await import("@stellar/stellar-sdk");
  const keypair = Keypair.fromSecret(wallet.secretKey);
  let sentTx;
  try {
    sentTx = await tx.signAndSend({
      signTransaction: async (xdr: string) => {
        const { Transaction } = await import("@stellar/stellar-sdk");
        const stellarTx = new Transaction(xdr, REGISTRY_NETWORK_PASSPHRASE);
        stellarTx.sign(keypair);
        return { signedTxXdr: stellarTx.toXDR() };
      },
    });
  } catch (err: any) {
    throw mcpError(
      mapRegistryError({
        operation: `Update metadata submission failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }

  const txHash = sentTx?.sendTransactionResponse?.hash ?? null;
  return JSON.stringify(
    {
      status: "success",
      resourceId,
      metadata,
      txHash,
    },
    null,
    2,
  );
}

export async function setPrice(resourceId: string, price: string): Promise<string> {
  const wallet = requireWallet();
  if (_isMock()) return mockSetPrice(resourceId, price);

  const stroops = usdcToStroops(price);

  const client = createRegistryClient({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
    publicKey: wallet.publicKey,
  });

  let tx: Awaited<ReturnType<typeof client.set_price>>;
  try {
    tx = await client.set_price({ id: resourceId, new_price: stroops });
  } catch (err: any) {
    if (isTimeoutError(err)) {
      throw mcpError(
        mapTransportError({
          operation: `Set price failed for resource "${resourceId}"`,
          source: "soroban",
          error: err,
        }),
      );
    }
    throw mcpError(
      mapRegistryError({
        operation: `Set price failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }

  const result = tx.result;
  if (result.isErr()) {
    const err = result.unwrapErr();
    const notFound = err.message === RegistryErrors[2].message;
    throw mcpError(
      mapRegistryError({
        operation: `Set price failed for resource "${resourceId}"`,
        message: err.message,
        notFound,
      }),
    );
  }

  const { Keypair } = await import("@stellar/stellar-sdk");
  const keypair = Keypair.fromSecret(wallet.secretKey);
  let sentTx;
  try {
    sentTx = await tx.signAndSend({
      signTransaction: async (xdr: string) => {
        const { Transaction } = await import("@stellar/stellar-sdk");
        const stellarTx = new Transaction(xdr, REGISTRY_NETWORK_PASSPHRASE);
        stellarTx.sign(keypair);
        return { signedTxXdr: stellarTx.toXDR() };
      },
    });
  } catch (err: any) {
    throw mcpError(
      mapRegistryError({
        operation: `Set price submission failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }

  const txHash = sentTx?.sendTransactionResponse?.hash ?? null;
  return JSON.stringify(
    {
      status: "success",
      resourceId,
      price,
      txHash,
    },
    null,
    2,
  );
}

export async function transferOwnership(resourceId: string, newCreator: string): Promise<string> {
  const wallet = requireWallet();
  if (_isMock()) return mockTransferOwnership(resourceId, newCreator);

  const client = createRegistryClient({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
    publicKey: wallet.publicKey,
  });

  let tx: Awaited<ReturnType<typeof client.transfer_ownership>>;
  try {
    tx = await client.transfer_ownership({ id: resourceId, new_creator: newCreator });
  } catch (err: any) {
    if (isTimeoutError(err)) {
      throw mcpError(
        mapTransportError({
          operation: `Transfer ownership failed for resource "${resourceId}"`,
          source: "soroban",
          error: err,
        }),
      );
    }
    throw mcpError(
      mapRegistryError({
        operation: `Transfer ownership failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }

  const result = tx.result;
  if (result.isErr()) {
    const err = result.unwrapErr();
    const notFound = err.message === RegistryErrors[2].message;
    throw mcpError(
      mapRegistryError({
        operation: `Transfer ownership failed for resource "${resourceId}"`,
        message: err.message,
        notFound,
      }),
    );
  }

  const { Keypair } = await import("@stellar/stellar-sdk");
  const keypair = Keypair.fromSecret(wallet.secretKey);
  let sentTx;
  try {
    sentTx = await tx.signAndSend({
      signTransaction: async (xdr: string) => {
        const { Transaction } = await import("@stellar/stellar-sdk");
        const stellarTx = new Transaction(xdr, REGISTRY_NETWORK_PASSPHRASE);
        stellarTx.sign(keypair);
        return { signedTxXdr: stellarTx.toXDR() };
      },
    });
  } catch (err: any) {
    throw mcpError(
      mapRegistryError({
        operation: `Transfer ownership submission failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }

  const txHash = sentTx?.sendTransactionResponse?.hash ?? null;
  return JSON.stringify(
    {
      status: "success",
      resourceId,
      newCreator,
      txHash,
    },
    null,
    2,
  );
}

export async function setListed(resourceId: string, listed: boolean): Promise<string> {
  const wallet = requireWallet();
  if (_isMock()) return mockSetListed(resourceId, listed);

  const client = createRegistryClient({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
    publicKey: wallet.publicKey,
  });

  let tx: Awaited<ReturnType<typeof client.set_listed>>;
  try {
    tx = await client.set_listed({ id: resourceId, listed });
  } catch (err: any) {
    if (isTimeoutError(err)) {
      throw mcpError(
        mapTransportError({
          operation: `Set listed failed for resource "${resourceId}"`,
          source: "soroban",
          error: err,
        }),
      );
    }
    throw mcpError(
      mapRegistryError({
        operation: `Set listed failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }

  const result = tx.result;
  if (result.isErr()) {
    const err = result.unwrapErr();
    const notFound = err.message === RegistryErrors[2].message;
    throw mcpError(
      mapRegistryError({
        operation: `Set listed failed for resource "${resourceId}"`,
        message: err.message,
        notFound,
      }),
    );
  }

  const { Keypair } = await import("@stellar/stellar-sdk");
  const keypair = Keypair.fromSecret(wallet.secretKey);
  let sentTx;
  try {
    sentTx = await tx.signAndSend({
      signTransaction: async (xdr: string) => {
        const { Transaction } = await import("@stellar/stellar-sdk");
        const stellarTx = new Transaction(xdr, REGISTRY_NETWORK_PASSPHRASE);
        stellarTx.sign(keypair);
        return { signedTxXdr: stellarTx.toXDR() };
      },
    });
  } catch (err: any) {
    throw mcpError(
      mapRegistryError({
        operation: `Set listed submission failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }

  const txHash = sentTx?.sendTransactionResponse?.hash ?? null;
  return JSON.stringify(
    {
      status: "success",
      resourceId,
      listed,
      txHash,
    },
    null,
    2,
  );
}

export async function registryLookup(resourceId: string): Promise<string> {
  if (_isMock())
    return mockRegistryLookup(resourceId, REGISTRY_CONTRACT_ID, currentWallet()?.publicKey);
  const client = createRegistryClient({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
  });

  let tx: Awaited<ReturnType<typeof client.get>>;
  try {
    tx = await client.get({ id: resourceId });
  } catch (err: any) {
    throw mcpError(
      mapTransportError({
        operation: `On-chain lookup failed for resource "${resourceId}" (contract ${REGISTRY_CONTRACT_ID}, RPC ${SOROBAN_RPC_URL})`,
        source: "soroban",
        error: err,
      }),
    );
  }

  const result = tx.result;
  if (result.isErr()) {
    const err = result.unwrapErr();
    if (err.message === RegistryErrors[2].message) {
      return JSON.stringify(
        {
          source: "on-chain",
          found: false,
          resourceId,
          message: `Resource "${resourceId}" is not registered on-chain. It may not have been listed yet or the ID may be incorrect.`,
          next: mapRegistryError({
            operation: "Registry lookup",
            message: err.message,
            notFound: true,
          }).action,
          contract: REGISTRY_CONTRACT_ID,
          network: REGISTRY_NETWORK_PASSPHRASE,
          rpc: SOROBAN_RPC_URL,
        },
        null,
        2,
      );
    }
    throw mcpError(
      mapRegistryError({
        operation: `Contract error for resource "${resourceId}" (contract ${REGISTRY_CONTRACT_ID}, network ${REGISTRY_NETWORK_PASSPHRASE})`,
        message: err.message,
      }),
    );
  }

  const resource = result.unwrap();
  const priceUsdc = stroopsToUsdc(BigInt(resource.price as unknown as bigint));

  return JSON.stringify(
    {
      source: "on-chain",
      found: true,
      id: resource.id,
      creator: resource.creator,
      price: `${priceUsdc} USDC`,
      metadata: resource.metadata,
      listed: resource.listed,
      tags: resource.tags,
      contract: REGISTRY_CONTRACT_ID,
      network: REGISTRY_NETWORK_PASSPHRASE,
      rpc: SOROBAN_RPC_URL,
    },
    null,
    2,
  );
}

/**
 * Paginated list of resources from the on-chain vault registry (contract `list`).
 * Data comes from Soroban, not the MindVault API catalog.
 */
export async function registryList(start: number, limit: number): Promise<string> {
  if (_isMock())
    return mockRegistryList(start, limit, REGISTRY_CONTRACT_ID, currentWallet()?.publicKey);

  const client = createRegistryClient({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
  });

  let resources: Resource[];
  try {
    resources = await listResources(client, start, limit);
  } catch (err: unknown) {
    throw mcpError(
      mapTransportError({
        operation: `On-chain list failed (contract ${REGISTRY_CONTRACT_ID}, RPC ${SOROBAN_RPC_URL}, start ${start}, limit ${limit})`,
        source: "soroban",
        error: err,
      }),
    );
  }

  if (resources.length === 0) {
    const message =
      start === 0
        ? "No resources registered on-chain yet."
        : `No on-chain resources in range [${start}, ${start + limit}). Try a lower start index or call mindvault_registry_info for contract context.`;
    return JSON.stringify(
      {
        source: "on-chain",
        start,
        limit,
        count: 0,
        message,
        resources: [],
        contract: REGISTRY_CONTRACT_ID,
        network: REGISTRY_NETWORK_PASSPHRASE,
        rpc: SOROBAN_RPC_URL,
      },
      null,
      2,
    );
  }

  const items = resources.map((resource) => {
    const priceUsdc = stroopsToUsdc(BigInt(resource.price as unknown as bigint));
    return {
      id: resource.id,
      creator: resource.creator,
      price: `${priceUsdc} USDC`,
      metadata: resource.metadata,
      listed: resource.listed,
      tags: resource.tags,
    };
  });

  return JSON.stringify(
    {
      source: "on-chain",
      start,
      limit,
      count: items.length,
      resources: items,
      contract: REGISTRY_CONTRACT_ID,
      network: REGISTRY_NETWORK_PASSPHRASE,
      rpc: SOROBAN_RPC_URL,
    },
    null,
    2,
  );
}

export async function recoverCatalogCache(): Promise<string> {
  if (_isMock()) {
    return JSON.stringify(
      {
        source: "mcp",
        action: "recover_catalog_cache",
        message: "Mock: catalog cache recovery triggered (no-op in mock).",
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      source: "mcp",
      action: "recover_catalog_cache",
      message:
        "Catalog cache recovery requested. The MCP does not perform automatic invalidation; re-run `mindvault_browse` to refresh client caches, restart the MCP to prime server-side caches, or trigger your API server's reindex endpoint if available.",
    },
    null,
    2,
  );
}

function registryInfo(): string {
  const info: {
    contractId: string;
    networkPassphrase: string;
    rpcUrl: string;
    network: string;
    x402Network: string;
    resourceFields: (keyof Resource)[];
    mainnetDiagnostics: string;
  } = {
    contractId: REGISTRY_CONTRACT_ID,
    networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
    rpcUrl: SOROBAN_RPC_URL,
    network: STELLAR_NETWORK,
    x402Network: NETWORK,
    resourceFields: ["id", "creator", "price", "metadata", "listed"],
    mainnetDiagnostics: formatMainnetDiagnostics({
      stellarNetwork: STELLAR_NETWORK,
      x402Network: NETWORK,
      registryContractId: REGISTRY_CONTRACT_ID,
      allowMainnetEnv: mainnetAllowedFromEnv(),
    }),
  };
  return JSON.stringify(info, null, 2);
}

export async function checkConsistency(
  resourceId: string,
  expectedMetadataHash?: string,
): Promise<string> {
  if (!resourceId) throw new Error("resourceId is required.");
  const expected = expectedMetadataHash
    ? parseMetadataHash(expectedMetadataHash, "expectedMetadataHash").canonical
    : null;

  const apiRes = await jsonFetch(`${BASE_URL}/resources/${resourceId}/meta`);
  const apiData = apiRes.ok ? apiRes.data : null;

  let onchainData: any = null;
  let onchainError: string | null = null;
  try {
    const client = createRegistryClient({
      contractId: REGISTRY_CONTRACT_ID,
      rpcUrl: SOROBAN_RPC_URL,
      networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
    });
    const tx = await client.get({ id: resourceId });
    if (tx.result.isOk()) {
      onchainData = tx.result.unwrap();
    } else {
      onchainError = tx.result.unwrapErr().message;
    }
  } catch (err: any) {
    onchainError = err.message;
  }

  const report: {
    resourceId: string;
    apiFound: boolean;
    onchainFound: boolean;
    onchainError: string | null;
    matches: Record<string, { api: any; onchain: any }>;
    mismatches: Record<string, { api: any; onchain: any }>;
    missingInApi: string[];
    missingInOnchain: string[];
  } = {
    resourceId,
    apiFound: !!apiData,
    onchainFound: !!onchainData,
    onchainError,
    matches: {},
    mismatches: {},
    missingInApi: [],
    missingInOnchain: [],
  };

  if (!apiData && !onchainData) {
    return JSON.stringify(
      {
        ...report,
        summary: "Resource not found in API catalog or on-chain registry.",
      },
      null,
      2,
    );
  }

  if (!apiData) {
    report.missingInApi = ["id", "title", "price", "metadata", "listed"];
    return JSON.stringify(
      {
        ...report,
        summary: "Resource exists on-chain but not in API catalog.",
      },
      null,
      2,
    );
  }

  if (!onchainData) {
    report.missingInOnchain = ["id", "creator", "price", "metadata", "listed"];
    return JSON.stringify(
      {
        ...report,
        summary: "Resource exists in API catalog but not on-chain registry.",
      },
      null,
      2,
    );
  }

  const priceUsdc = stroopsToUsdc(BigInt(onchainData.price as unknown as bigint));

  const apiPrice = parseFloat(apiData.price || "0");
  const onchainPrice = parseFloat(priceUsdc);
  if (Math.abs(apiPrice - onchainPrice) < 0.0000001) {
    report.matches.price = { api: apiData.price, onchain: priceUsdc };
  } else {
    report.mismatches.price = { api: apiData.price, onchain: priceUsdc };
  }

  if (apiData.verificationStatus === "verified" && onchainData.listed === true) {
    report.matches.listed = { api: "verified", onchain: true };
  } else if (apiData.verificationStatus !== "verified" && onchainData.listed === false) {
    report.matches.listed = { api: apiData.verificationStatus, onchain: false };
  } else {
    report.mismatches.listed = { api: apiData.verificationStatus, onchain: onchainData.listed };
  }

  if (apiData.accessUrl === onchainData.metadata) {
    report.matches.metadata = { api: apiData.accessUrl, onchain: onchainData.metadata };
  } else {
    report.mismatches.metadata = { api: apiData.accessUrl, onchain: onchainData.metadata };
  }

  report.matches.id = { api: apiData.id, onchain: onchainData.id };

  const summary =
    Object.keys(report.mismatches).length === 0
      ? "All compared fields match between API and on-chain registry."
      : `Found ${Object.keys(report.mismatches).length} mismatched field(s).`;

  return JSON.stringify({ ...report, summary }, null, 2);
}

/**
 * Report the current Stellar and x402 network configuration in use by this MCP
 * instance. Includes testnet/mainnet selection, RPC/Horizon URLs, registry and
 * USDC contract IDs, and warnings for environment variable overrides that
 * diverge from presets.
 */
export function networkProfile(): string {
  const warnings: string[] = [];

  const usdcContractId = process.env.USDC_CONTRACT_ID ?? networkPreset.usdcSacContractId;
  if (
    process.env.USDC_CONTRACT_ID &&
    process.env.USDC_CONTRACT_ID !== networkPreset.usdcSacContractId
  ) {
    warnings.push(
      `USDC_CONTRACT_ID overrides preset (${networkPreset.usdcSacContractId} → ${process.env.USDC_CONTRACT_ID})`,
    );
  }
  if (process.env.SOROBAN_RPC_URL && process.env.SOROBAN_RPC_URL !== networkPreset.sorobanRpcUrl) {
    warnings.push(
      `SOROBAN_RPC_URL overrides preset (${networkPreset.sorobanRpcUrl} → ${process.env.SOROBAN_RPC_URL})`,
    );
  }
  if (process.env.HORIZON_URL && process.env.HORIZON_URL !== networkPreset.horizonUrl) {
    warnings.push(
      `HORIZON_URL overrides preset (${networkPreset.horizonUrl} → ${process.env.HORIZON_URL})`,
    );
  }
  if (
    process.env.VAULT_REGISTRY_CONTRACT_ID &&
    networkPreset.defaultRegistryContractId &&
    process.env.VAULT_REGISTRY_CONTRACT_ID !== networkPreset.defaultRegistryContractId
  ) {
    warnings.push(
      `VAULT_REGISTRY_CONTRACT_ID overrides preset (${networkPreset.defaultRegistryContractId} → ${process.env.VAULT_REGISTRY_CONTRACT_ID})`,
    );
  }
  if (process.env.NETWORK && process.env.NETWORK !== networkPreset.x402Network) {
    warnings.push(
      `NETWORK overrides preset (${networkPreset.x402Network} → ${process.env.NETWORK})`,
    );
  }

  const profile = {
    stellarNetwork: STELLAR_NETWORK,
    x402Network: NETWORK,
    sorobanRpcUrl: SOROBAN_RPC_URL,
    horizonUrl: HORIZON_URL,
    registryContractId: REGISTRY_CONTRACT_ID,
    usdcContractId,
    timeouts: describeTimeouts(TIMEOUTS),
    retries: describeRetryPolicy(RETRY_POLICY),
    warnings,
  };

  return JSON.stringify(profile, null, 2);
}

/**
 * Verify the installed registry-client bindings match the deployed contract's
 * interface. Returns the check's deterministic, agent-safe message.
 */
async function checkBindings(): Promise<string> {
  if (_isMock()) return "Mock mode: contract binding check skipped (no live RPC).";
  const result = await checkContractBindings({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
    network: STELLAR_NETWORK,
  });
  return result.message;
}

/**
 * Return opt-in tool-level metrics as JSON. Pass reset=true to clear counters
 * after reading. Text-only when disabled (still JSON so structuredContent works).
 */
function toolMetrics(reset: boolean): string {
  const snapshot = metrics.snapshot();
  if (reset) metrics.reset();
  if (!snapshot.enabled) {
    return JSON.stringify(
      {
        enabled: false,
        message:
          "Metrics are disabled. Set MINDVAULT_METRICS=1 (or true/yes/on) and restart the server to collect tool-level metrics.",
      },
      null,
      2,
    );
  }
  return JSON.stringify(snapshot, null, 2);
}

const SELF_VALIDATING_TOOLS = new Set(TOOLS_WITHOUT_ARG_VALIDATION);

function isDispatchableTool(name: string): boolean {
  return name in TOOL_ARGUMENT_SPECS || SELF_VALIDATING_TOOLS.has(name);
}

const STATE_MUTATING_TOOLS = new Set([
  "mindvault_setup_wallet",
  "mindvault_use_profile",
  "mindvault_register",
  "mindvault_publish",
  "mindvault_buy",
  "mindvault_register_onchain",
  "mindvault_update_metadata",
  "mindvault_set_price",
  "mindvault_transfer_ownership",
  "mindvault_set_listed",
  "mindvault_set_tags",
  "mindvault_reset",
  "mindvault_restore_state",
  "mindvault_import_wallet",
  "mindvault_rotate_publisher_key",
  "mindvault_metrics",
]);

const stateMutex = new Mutex();

async function dispatchToolOutcome(
  name: string,
  rawArgs: unknown,
  onProgress?: (progress: number, total?: number, message?: string) => Promise<void>,
): Promise<ToolOutcome> {
  if (!isDispatchableTool(name)) {
    throw new UnknownToolError(name);
  }

  // Read-only mode is checked before argument validation (#593): when the
  // server cannot run this tool at all, a malformed-arguments error would be
  // a misleading thing to report, and the refusal does not depend on the
  // arguments being well-formed.
  assertToolAllowedInReadOnlyMode(name, process.env);

  const rawRecord =
    typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {};

  const isDryRunCall =
    (name === "mindvault_publish" || name === "mindvault_buy") && rawRecord.dryRun === true;

  const args: ValidatedArgs =
    name in TOOL_ARGUMENT_SPECS && !isDryRunCall ? validateToolArgs(name, rawArgs) : {};
  const dryRunArgs = isDryRunCall ? (rawRecord as ValidatedArgs) : args;

  assertMainnetMutationAllowed(NETWORK, name, rawRecord);

  // Network-independent spend confirmation (#594). Distinct from the mainnet
  // guardrail above (which only fires on pubnet) and from the auto-pay ceiling
  // in buy() (which only fires above an amount); a call may have to satisfy
  // all three. Off unless MINDVAULT_CONFIRM_PAID_OPERATIONS says otherwise.
  assertPaidOperationConfirmed({
    toolName: name,
    args: rawRecord,
    dryRun: isDryRunCall,
    env: process.env,
  });

  if (API_MUTATION_TOOLS.has(name) && !isDryRunCall) {
    await assertApiReachableFor(name);
  }

  const execute = async (): Promise<ToolOutcome> => {
    switch (name) {
      case "mindvault_setup_wallet":
        return setupWallet(optionalString(args, "profile"));
      case "mindvault_wallet_info":
        return walletInfoOutcome();
      case "mindvault_use_profile":
        return useProfileOutcome(requiredString(args, "name"));
      case "mindvault_list_profiles":
        return listProfilesOutcome();
      case "mindvault_browse": {
        const parsed = parseCatalogFilters(rawRecord);
        return parsed.ok ? browseOutcome(parsed.filters) : parsed.error;
      }
      case "mindvault_search": {
        const parsed = parseCatalogFilters(rawRecord, { requireCriteria: true });
        return parsed.ok ? searchOutcome(parsed.filters) : parsed.error;
      }
      case "mindvault_preview":
        return preview(requiredString(args, "resourceId"));
      case "mindvault_register":
        return register(
          requiredString(args, "name"),
          requiredString(args, "email"),
          optionalString(args, "walletAddress"),
        );
      case "mindvault_publish":
        return publish({
          title: requiredString(dryRunArgs, "title"),
          description: optionalString(dryRunArgs, "description"),
          price: requiredString(dryRunArgs, "price"),
          externalUrl: requiredString(dryRunArgs, "externalUrl"),
          dryRun: flag(dryRunArgs, "dryRun"),
        });
      case "mindvault_publish_status":
        return publishStatus(rawRecord, onProgress);
      case "mindvault_buy":
        return buy(
          requiredString(dryRunArgs, "resourceId"),
          flag(dryRunArgs, "dryRun"),
          undefined,
          onProgress,
          optionalString(dryRunArgs, "maxAutoPayUsdc"),
        );
      case "mindvault_purchase_history":
        return purchaseHistoryTool(rawRecord);
      case "mindvault_export_receipts":
        return exportReceiptsTool(rawRecord);
      case "mindvault_register_onchain":
        return registerOnchain(requiredString(args, "resourceId"), onProgress);
      case "mindvault_agent_status":
        return agentStatus();
      case "mindvault_registry_info":
        return registryInfo();
      case "mindvault_network_profile":
        return networkProfile();
      case "mindvault_check_bindings":
        return checkBindings();
      case "mindvault_check_consistency":
        return checkConsistency(
          requiredString(args, "resourceId"),
          optionalString(args, "expectedMetadataHash"),
        );
      case "mindvault_registry_lookup":
        return registryLookup(requiredString(args, "resourceId"));
      case "mindvault_registry_list":
        return registryList(
          optionalInt(args, "start", REGISTRY_LIST_DEFAULT_START),
          optionalInt(args, "limit", REGISTRY_LIST_DEFAULT_LIMIT),
        );
      case "mindvault_update_metadata":
        return updateMetadata(requiredString(args, "resourceId"), requiredString(args, "metadata"));
      case "mindvault_set_price":
        return setPrice(requiredString(args, "resourceId"), requiredString(args, "price"));
      case "mindvault_transfer_ownership":
        return transferOwnership(
          requiredString(args, "resourceId"),
          requiredString(args, "newCreator"),
        );
      case "mindvault_set_listed":
        return setListed(requiredString(args, "resourceId"), flag(args, "listed"));
      case "mindvault_tx_status":
        return txStatus(requiredString(args, "txHash"));
      case "mindvault_reset":
        return resetState(flag(args, "all"), rawRecord.confirm);
      case "mindvault_backup_state":
        return backupState(requiredString(args, "passphrase"));
      case "mindvault_restore_state":
        return restoreStateTool(requiredString(args, "blob"), requiredString(args, "passphrase"));
      case "mindvault_metrics":
        return toolMetrics(flag(args, "reset"));
      case "mindvault_check_state_permissions":
        return checkStatePermissionsTool();
      case "mindvault_registry_health":
        return registryHealth();
      case "mindvault_import_wallet":
        return importWallet({
          secretKey: optionalString(args, "secretKey"),
          profile: optionalString(args, "profile"),
          persist: flag(args, "persist"),
        });
      case "mindvault_rotate_publisher_key":
        return rotatePublisherKey(optionalString(args, "profile"));
      case "mindvault_verify_install":
        return formatVerifyInstall(verifyInstall(process.env));
      case "mindvault_recover_catalog_cache":
        return recoverCatalogCache();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };

  if (STATE_MUTATING_TOOLS.has(name)) {
    return stateMutex.runExclusive(execute);
  }
  return execute();
}

/** Dispatch a tool and return the human-readable text block (unit-test surface). */
export async function dispatchTool(
  name: string,
  rawArgs: unknown,
  onProgress?: (progress: number, total?: number, message?: string) => Promise<void>,
): Promise<string> {
  return outcomeText(await dispatchToolOutcome(name, rawArgs, onProgress));
}

/** Test helper: wrap a handler outcome the same way CallTool does. */
export function normalizeToolResultForTest(name: string, outcome: ToolOutcome) {
  return normalizeToolResult(name, outcome, hasOutputSchema);
}

const server = new Server(
  { name: "mindvault", version: "1.0.0" },
  { capabilities: { tools: {}, prompts: {}, resources: {} } },
);

// ── MCP resources (#545) ─────────────────────────────────────────────────────
// The vault catalog is exposed as resources so agents can discover entries
// (resources/list) and read their public metadata (resources/read) without
// invoking a tool. URIs are stable: mindvault://resource/<id>. Reads never
// return gated content — only the public meta endpoint is consulted.

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: await listCatalogResources(),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({
  contents: [await readCatalogResource(request.params.uri)],
}));

// ListTools is derived from TOOL_DEFINITIONS rather than restated here (#596).
// The handler used to carry its own copy of the whole list, which had drifted
// from tools.ts in both directions — six implemented tools were undiscoverable,
// two advertised tools were missing from the generated docs, and several
// schemas had lost their field descriptions and optional arguments.
// `listToolsContract.test.ts` checks this response against the definitions, the
// argument validator, and the dispatch switch on every run.
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: advertisedTools(process.env),
}));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args = {} } = request.params;
  const progressToken = request.params._meta?.progressToken;
  const onProgress =
    progressToken != null
      ? createProgressEmitter({ token: progressToken, send: extra.sendNotification })
      : undefined;
  try {
    const result = await measureTool(metrics, name, () =>
      dispatchToolOutcome(name, args, onProgress),
    );
    return normalizeToolResult(name, result, hasOutputSchema);
  } catch (err: any) {
    const mapped = mappedErrorOf(err);
    return {
      content: [{ type: "text", text: `Error: ${safeErrorMessage(err)}` }],
      isError: true,
      ...(mapped ? { structuredContent: { troubleshooting: troubleshootingHint(mapped) } } : {}),
    };
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPT_DEFINITIONS.map((p) => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments.map((a) => ({
      name: a.name,
      description: a.description,
      required: a.required,
    })),
  })),
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const result = getPrompt(name, args as Record<string, string | undefined>);
  return {
    description: result.description,
    messages: result.messages,
  };
});

if (!process.env.VITEST && !MOCK) {
  void checkContractBindings({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
    network: STELLAR_NETWORK,
  })
    .then((result: { status: string; message: string }) => {
      if (result.status === "mismatch") console.error(`MindVault MCP: ${result.message}`);
    })
    .catch(() => {});
}

export { server };

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    saveState();
    await server.close();
  } catch {
    void 0;
  }

  const exitCode = signal === "SIGINT" ? 130 : 0;
  process.exit(exitCode);
}

if (!process.env.VITEST) {
  const transport = new StdioServerTransport();

  transport.onclose = () => shutdown("transport-close");
  transport.onerror = () => shutdown("transport-error");

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.stdin.on("end", () => shutdown("stdin-EOF"));

  await server.connect(transport);
}
