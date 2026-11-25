import { xdr } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  CONTRACT_EVENT_HISTORY_DEFAULT_LIMIT,
  buildContractEventHistoryRequest,
  contractEventHistoryOutcome,
  parseContractEventHistory,
} from "./contractEventHistory.js";
import { CONTRACT_EVENT_HISTORY_OUTPUT_SCHEMA } from "./outputSchemas.js";
import { checkOutput, successSchemaOf } from "./outputValidation.js";

const encoded = (value: xdr.ScVal) => value.toXDR("base64");
const xdrText = (value: string) => xdr.ScVal.scvString(value);
const xdrSymbol = (value: string) => xdr.ScVal.scvSymbol(value);

function rpcResponse(result: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function matchingEvents() {
  return [
    {
      id: "unrelated",
      ledger: 1,
      ledgerClosedAt: "2026-01-01T00:00:00Z",
      txHash: "unrelated-hash",
      topic: [encoded(xdrSymbol("register")), encoded(xdrText("other-id"))],
      value: encoded(xdr.ScVal.scvU32(1)),
    },
    {
      id: "later",
      ledger: 3,
      ledgerClosedAt: "2026-01-03T00:00:00Z",
      txHash: "later-hash",
      topic: [encoded(xdrSymbol("setprice"))],
      value: encoded(xdr.ScVal.scvVec([xdrText("res-1"), xdr.ScVal.scvU32(7)])),
    },
    {
      id: "earlier",
      ledger: 2,
      ledgerClosedAt: "2026-01-02T00:00:00Z",
      txHash: "earlier-hash",
      topic: [encoded(xdrSymbol("register")), encoded(xdrText("res-1"))],
      value: encoded(xdr.ScVal.scvU32(2)),
    },
  ];
}

describe("contract event history", () => {
  it("builds a contract-scoped getEvents request", () => {
    expect(
      buildContractEventHistoryRequest(
        { resourceId: "res-1", startLedger: 123, limit: 25 },
        "CTEST",
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "getEvents",
      params: {
        startLedger: 123,
        filters: [{ type: "contract", contractIds: ["CTEST"] }],
        pagination: { limit: 25 },
      },
    });
  });

  it("includes a cursor only when continuing a page", () => {
    expect(
      buildContractEventHistoryRequest(
        { resourceId: "res-1", cursor: "123-0000000000", limit: 10 },
        "CTEST",
      ),
    ).toMatchObject({
      params: {
        filters: [{ type: "contract", contractIds: ["CTEST"] }],
        pagination: { cursor: "123-0000000000", limit: 10 },
      },
    });
  });

  it("decodes, filters, and orders events for the requested resource", () => {
    const result = parseContractEventHistory(
      { result: { events: matchingEvents(), cursor: "next-cursor" } },
      { resourceId: "res-1", contractId: "CTEST" },
    );

    expect(result.events.map((event) => event.id)).toEqual(["earlier", "later"]);
    expect(result.scanned).toBe(3);
    expect(result.events[0]?.topic).toEqual(["register", "res-1"]);
    expect(result.events[1]?.value).toEqual(["res-1", 7]);
    expect(result.cursor).toBe("next-cursor");
    expect(result.hasMore).toBe(true);
    expect(result.notice).toContain("More events are available");
  });

  it("reports a deterministic miss without failing", () => {
    const result = parseContractEventHistory(
      { result: { events: matchingEvents() } },
      { resourceId: "missing-id", contractId: "CTEST" },
    );

    expect(result.events).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.notice).toContain('No contract events for resource "missing-id"');
  });

  it("returns a structured result that matches its advertised schema", async () => {
    const fetcher = vi.fn(async (_init: RequestInit, _label: string) =>
      rpcResponse({ events: matchingEvents() }),
    );

    const outcome = await contractEventHistoryOutcome(
      { resourceId: "res-1", limit: CONTRACT_EVENT_HISTORY_DEFAULT_LIMIT },
      { contractId: "CTEST", fetch: fetcher },
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(outcome.text).toContain('Contract event history for resource "res-1"');
    const check = checkOutput(
      successSchemaOf(CONTRACT_EVENT_HISTORY_OUTPUT_SCHEMA)!,
      outcome.structured,
    );
    expect(check).toEqual({ valid: true });
  });

  it("maps RPC transport failures to a troubleshooting hint", async () => {
    const fetcher = vi.fn(async (_init: RequestInit, _label: string): Promise<Response> => {
      throw new Error("offline rpc");
    });

    await expect(
      contractEventHistoryOutcome(
        { resourceId: "res-1", limit: 10 },
        { contractId: "CTEST", fetch: fetcher },
      ),
    ).rejects.toMatchObject({
      mapped: { source: "soroban", category: "network", detail: "offline rpc" },
    });
  });

  it("maps RPC JSON errors to a server category", async () => {
    const fetcher = vi.fn(
      async (_init: RequestInit, _label: string) =>
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "bad filter" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await expect(
      contractEventHistoryOutcome(
        { resourceId: "res-1", limit: 10 },
        { contractId: "CTEST", fetch: fetcher },
      ),
    ).rejects.toMatchObject({
      mapped: { source: "soroban", category: "server", detail: "bad filter" },
    });
  });

  it("rejects startLedger and cursor together", async () => {
    await expect(
      contractEventHistoryOutcome(
        { resourceId: "res-1", startLedger: 1, cursor: "cursor", limit: 10 },
        { contractId: "CTEST", fetch: vi.fn() },
      ),
    ).rejects.toMatchObject({ mapped: { source: "soroban", category: "validation" } });
  });

  it("rejects a missing contract id", async () => {
    await expect(
      contractEventHistoryOutcome(
        { resourceId: "res-1", limit: 10 },
        { contractId: undefined, fetch: vi.fn() },
      ),
    ).rejects.toMatchObject({ mapped: { source: "soroban", category: "validation" } });
  });
});
