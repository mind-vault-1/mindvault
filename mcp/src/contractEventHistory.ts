import { scValToNative, xdr } from "@stellar/stellar-sdk";

import { mapTransportError, mcpError, throwHttpError } from "./errorMapping.js";
import type { ToolOutcome } from "./toolResult.js";

export const CONTRACT_EVENT_HISTORY_DEFAULT_LIMIT = 50;
export const CONTRACT_EVENT_HISTORY_MAX_LIMIT = 200;

export interface ContractEventHistoryParams {
  resourceId: string;
  startLedger?: number;
  cursor?: string;
  limit: number;
}

export interface ContractEventHistoryDeps {
  contractId: string | undefined;
  fetch: (init: RequestInit, label: string) => Promise<Response>;
}

export interface ContractEventHistoryEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string | null;
  txHash: string | null;
  topic: unknown[];
  value: unknown;
}

export interface ContractEventHistoryResult {
  resourceId: string;
  contractId: string;
  events: ContractEventHistoryEvent[];
  scanned: number;
  cursor: string | null;
  hasMore: boolean;
  notice: string | null;
}

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function normalizeJson(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (depth > 12) return null;
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJson(item, seen, depth + 1));
  }
  if (value instanceof Map) {
    const out: RecordValue = {};
    for (const [key, item] of value.entries()) {
      out[String(key)] = normalizeJson(item, seen, depth + 1);
    }
    return out;
  }
  if (typeof value === "object") {
    if (seen.has(value)) return null;
    seen.add(value);
    const out: RecordValue = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = normalizeJson(item, seen, depth + 1);
    }
    return out;
  }
  return String(value);
}

function decodeScVal(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return normalizeJson(scValToNative(xdr.ScVal.fromXDR(value, "base64")), new WeakSet(), 0);
  } catch {
    return null;
  }
}

function ledgerNumber(value: unknown): number {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function matchesResource(
  resourceId: string,
  decodedTopic: unknown[],
  decodedValue: unknown,
  rawTopic: unknown[],
): boolean {
  const candidates: unknown[] = [...rawTopic, ...decodedTopic];
  if (Array.isArray(decodedValue)) candidates.push(...decodedValue);
  const value = asRecord(decodedValue);
  if (value && "id" in value) candidates.push(value.id);
  if (value && "resourceId" in value) candidates.push(value.resourceId);
  return candidates.some((candidate) => typeof candidate === "string" && candidate === resourceId);
}

function sortEvents(a: ContractEventHistoryEvent, b: ContractEventHistoryEvent): number {
  if (a.ledger !== b.ledger) return a.ledger - b.ledger;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildContractEventHistoryRequest(
  params: ContractEventHistoryParams,
  contractId: string,
): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "getEvents",
    params: {
      ...(params.startLedger === undefined ? {} : { startLedger: params.startLedger }),
      filters: [{ type: "contract", contractIds: [contractId] }],
      pagination: {
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        limit: params.limit,
      },
    },
  };
}

export function parseContractEventHistory(
  payload: unknown,
  options: { resourceId: string; contractId: string },
): ContractEventHistoryResult {
  const envelope = asRecord(payload);
  const result = asRecord(envelope?.result ?? payload) ?? {};
  const rawEvents = Array.isArray(result.events) ? result.events : [];
  const events: ContractEventHistoryEvent[] = [];

  rawEvents.forEach((entry, index) => {
    const event = asRecord(entry) ?? {};
    const rawTopic = Array.isArray(event.topic) ? event.topic : [];
    const topic = rawTopic.map(decodeScVal);
    const value = decodeScVal(event.value);
    const txHash = typeof event.txHash === "string" ? event.txHash : null;
    const ledger = ledgerNumber(event.ledger);
    const id =
      typeof event.id === "string" && event.id.length > 0
        ? event.id
        : `${txHash ?? "event"}:${ledger}:${index}`;

    if (!matchesResource(options.resourceId, topic, value, rawTopic)) return;

    events.push({
      id,
      ledger,
      ledgerClosedAt: typeof event.ledgerClosedAt === "string" ? event.ledgerClosedAt : null,
      txHash,
      topic,
      value,
    });
  });

  events.sort(sortEvents);
  const cursor =
    typeof result.cursor === "string" && result.cursor.length > 0 ? result.cursor : null;
  const notices: string[] = [];
  if (events.length === 0) {
    notices.push(
      `No contract events for resource "${options.resourceId}" were present in this page. Check the resource id or pass startLedger/cursor to search a different range.`,
    );
  }
  if (cursor) {
    notices.push("More events are available; pass cursor to continue.");
  }

  return {
    resourceId: options.resourceId,
    contractId: options.contractId,
    events,
    scanned: rawEvents.length,
    cursor,
    hasMore: cursor !== null,
    notice: notices.length > 0 ? notices.join(" ") : null,
  };
}

export function renderContractEventHistory(result: ContractEventHistoryResult): string {
  const lines = [
    `Contract event history for resource "${result.resourceId}" (contract ${result.contractId}).`,
    `Matched ${result.events.length} of ${result.scanned} events in this page.`,
  ];
  for (const event of result.events) {
    lines.push(
      `- ledger ${event.ledger} · ${event.txHash ?? "unknown tx"} · ${event.id}: topic=${JSON.stringify(event.topic)} value=${JSON.stringify(event.value)}`,
    );
  }
  lines.push(`Cursor: ${result.cursor ?? "none"}`);
  if (result.notice) lines.push(`Note: ${result.notice}`);
  return lines.join("\n");
}

export async function contractEventHistoryOutcome(
  params: ContractEventHistoryParams,
  deps: ContractEventHistoryDeps,
): Promise<ToolOutcome> {
  const operation = `Contract event history for resource "${params.resourceId}"`;

  if (!deps.contractId) {
    throw mcpError({
      source: "soroban",
      category: "validation",
      summary: `${operation}: VAULT_REGISTRY_CONTRACT_ID is not set.`,
      action:
        "Set VAULT_REGISTRY_CONTRACT_ID to the deployed vault-registry contract id, then retry.",
    });
  }
  if (params.cursor !== undefined && params.startLedger !== undefined) {
    throw mcpError({
      source: "soroban",
      category: "validation",
      summary: `${operation}: pass either startLedger or cursor, not both.`,
      action:
        "Use startLedger for a fresh search, or the returned cursor to continue a paged search.",
    });
  }

  const request = buildContractEventHistoryRequest(params, deps.contractId);
  let response: Response;
  try {
    response = await deps.fetch(
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
      operation,
    );
  } catch (err) {
    throw mcpError(mapTransportError({ operation, source: "soroban", error: err }));
  }

  if (!response.ok) {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = await response.text().catch(() => null);
    }
    throwHttpError({ operation, source: "soroban", status: response.status, data });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw mcpError(
      mapTransportError({
        operation: `${operation}: invalid JSON response`,
        source: "soroban",
        error: err,
      }),
    );
  }

  const envelope = asRecord(payload);
  const rpcError = asRecord(envelope?.error);
  if (rpcError) {
    const detail =
      typeof rpcError.message === "string" && rpcError.message.length > 0
        ? rpcError.message
        : "Soroban RPC rejected getEvents.";
    throw mcpError({
      source: "soroban",
      category: "server",
      summary: `${operation}: ${detail}`,
      detail,
      action:
        "Check that SOROBAN_RPC_URL points at a reachable Soroban RPC endpoint for the configured network.",
    });
  }

  if (!asRecord(envelope?.result ?? payload)) {
    throw mcpError({
      source: "soroban",
      category: "server",
      summary: `${operation}: Soroban RPC returned an unexpected response.`,
      action:
        "Check that SOROBAN_RPC_URL points at a Soroban RPC endpoint that supports getEvents.",
    });
  }

  const result = parseContractEventHistory(payload, {
    resourceId: params.resourceId,
    contractId: deps.contractId,
  });
  return {
    text: renderContractEventHistory(result),
    structured: result as unknown as Record<string, unknown>,
  };
}
