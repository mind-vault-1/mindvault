import {
  activeProfile,
  activeProfileName,
  BASE_URL,
  currentApiKey,
  jsonFetch,
  requireWallet,
  resolveProfileName,
  saveState,
  setActiveProfileName,
  sorobanRpcFetch,
  SPONSORED_ACCOUNT_URL,
  STATE_FILE,
} from "../runtime.js";
import { getBalanceDetails } from "./registry.js";
import { mapRegistryError, mappedErrorOf, mcpError, throwHttpError } from "../errorMapping.js";
import {
  SPONSORED_CREATE_PATH,
  mapSponsoredHttpFailure,
  mapSponsoredTransportFailure,
} from "../sponsoredDiagnostics.js";
import {
  buildPublishStatusSnapshot,
  isVerificationSettled,
  normalizeIntervalMs,
  normalizeTimeoutMs,
  normalizeWaitFlag,
  type PublishStatusFetch,
} from "../publishStatus.js";

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

export async function setupWallet(profileArg?: string): Promise<string> {
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
  setActiveProfileName(target);
  activeProfile().wallet = { publicKey: res.data.publicKey, secretKey: res.data.secretKey };
  saveState();
  return [
    `Wallet created.`,
    `Profile: ${target}`,
    `Address: ${res.data.publicKey}`,
    `Wallet persisted to ${STATE_FILE} (mode 0600).`,
  ].join("\n");
}

export async function walletInfo(): Promise<string> {
  const wallet = requireWallet();
  const details = await getBalanceDetails(wallet.publicKey);

  const lines = [
    `Profile: ${activeProfileName}`,
    `Address: ${wallet.publicKey}`,
    `XLM Balance: ${details.xlmBalance}`,
    `XLM Reserved: ${details.xlmReserve} (base + subentries)`,
    `XLM Available: ${details.xlmAvailable}`,
    `USDC Balance: ${details.usdcBalance}`,
    `USDC Status: ${details.status}`,
    `Publisher registered: ${currentApiKey() ? "yes" : "no"}`,
  ];

  if (details.message) {
    lines.push(`Note: ${details.message}`);
  }

  return lines.join("\n");
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

export async function publishStatus(args: {
  resourceId?: string;
  wait?: unknown;
  timeoutMs?: unknown;
  intervalMs?: unknown;
}): Promise<string> {
  const resourceId = (args.resourceId ?? "").trim();
  if (!resourceId) {
    throw new Error(
      "resourceId is required. Pass the id returned by mindvault_publish (e.g. 'cm7x8y9z').",
    );
  }

  const wait = normalizeWaitFlag(args.wait);
  const timeoutMs = normalizeTimeoutMs(args.timeoutMs);
  const intervalMs = normalizeIntervalMs(args.intervalMs);

  let attempts = 0;
  let timedOut = false;
  const deadline = wait ? Date.now() + timeoutMs : Date.now();

  let data = await fetchPublishStatusData(resourceId);
  attempts += 1;

  while (wait) {
    const status = data.verification?.status ?? data.meta?.verificationStatus ?? "pending";
    if (isVerificationSettled(status)) break;
    if (Date.now() >= deadline) {
      timedOut = true;
      break;
    }
    const remaining = deadline - Date.now();
    await sleepMs(Math.min(intervalMs, Math.max(0, remaining)));
    if (Date.now() >= deadline) {
      data = await fetchPublishStatusData(resourceId);
      attempts += 1;
      const last = data.verification?.status ?? data.meta?.verificationStatus ?? "pending";
      timedOut = !isVerificationSettled(last);
      break;
    }
    data = await fetchPublishStatusData(resourceId);
    attempts += 1;
  }

  const snapshot = buildPublishStatusSnapshot(resourceId, data, {
    polled: wait,
    attempts,
    timedOut,
  });
  return JSON.stringify(snapshot, null, 2);
}
