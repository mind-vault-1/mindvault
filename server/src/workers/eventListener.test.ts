import { xdr } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const saveResourceTags = vi.fn();
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  return { logger, saveResourceTags };
});

vi.mock("../db/client.js", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

vi.mock("../services/resourceService.js", () => ({
  saveResourceTags: mocks.saveResourceTags,
}));

vi.mock("../config.js", () => ({
  config: {
    REGISTRY_CONTRACT_ID: "C123",
    SOROBAN_RPC_URL: "https://rpc.example.test",
  },
}));

vi.mock("../lib/logger.js", () => ({
  getLogger: () => mocks.logger,
}));

import {
  detectEventPaginationGaps,
  extractNextTags,
  handleSetTagsEvent,
  pollEvents,
  type SorobanEvent,
} from "./eventListener.js";

function makeEvent(nextTags: string[] | null, id = "res-1"): SorobanEvent {
  return {
    type: "contract",
    ledger: 10,
    ledgerClosedAt: "2026-09-25T00:00:00Z",
    contractId: "C123",
    id: "event-1",
    pagingToken: "1",
    topic: [JSON.stringify({ symbol: "settags" }), JSON.stringify(id)],
    value: {
      type: "vec",
      vec: [
        { type: "vec", vec: [{ type: "string", value: "old" }] },
        nextTags === null
          ? { type: "string", value: "invalid" }
          : { type: "vec", vec: nextTags.map((value) => ({ type: "string", value })) },
      ],
    },
  };
}

function makeXdrEvent(): SorobanEvent {
  return {
    type: "contract",
    ledger: 11,
    ledgerClosedAt: "2026-09-25T00:00:00Z",
    contractId: "C123",
    id: "event-xdr",
    pagingToken: "2",
    topic: [
      xdr.ScVal.scvSymbol("settags"),
      xdr.ScVal.scvString("res-xdr"),
    ] as unknown as SorobanEvent["topic"],
    value: xdr.ScVal.scvVec([
      xdr.ScVal.scvVec([xdr.ScVal.scvString("old")]),
      xdr.ScVal.scvVec([xdr.ScVal.scvString("new"), xdr.ScVal.scvString("api")]),
    ]) as unknown as SorobanEvent["value"],
  };
}

describe("settags event handling", () => {
  beforeEach(() => {
    mocks.saveResourceTags.mockReset();
    mocks.saveResourceTags.mockResolvedValue(true);
    mocks.logger.debug.mockClear();
    mocks.logger.error.mockClear();
    mocks.logger.info.mockClear();
    mocks.logger.warn.mockClear();
  });

  it("extracts the next tag vector and ignores the previous vector", () => {
    expect(extractNextTags(makeEvent(["new", "api"]))).toEqual(["new", "api"]);
  });

  it("extracts an empty replacement vector", () => {
    expect(extractNextTags(makeEvent([]))).toEqual([]);
  });

  it("extracts tags from the SDK's XDR event representation", () => {
    expect(extractNextTags(makeXdrEvent())).toEqual(["new", "api"]);
  });

  it("returns null for a malformed event payload", () => {
    expect(extractNextTags(makeEvent(null))).toBeNull();
  });

  it("replaces stored tags and invalidates resource reads", async () => {
    await handleSetTagsEvent(makeEvent(["new", "api"]));

    expect(mocks.saveResourceTags).toHaveBeenCalledWith("res-1", ["new", "api"]);
    expect(mocks.logger.info).toHaveBeenCalledWith(
      { event: "event_settags", resourceId: "res-1", tags: ["new", "api"] },
      "synced settags event",
    );
  });

  it("saves an XDR event using its decoded resource id", async () => {
    await handleSetTagsEvent(makeXdrEvent());

    expect(mocks.saveResourceTags).toHaveBeenCalledWith("res-xdr", ["new", "api"]);
  });

  it("does not save when the resource is unknown", async () => {
    mocks.saveResourceTags.mockResolvedValue(false);

    await handleSetTagsEvent(makeEvent(["new"]));

    expect(mocks.saveResourceTags).toHaveBeenCalledWith("res-1", ["new"]);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      { event: "event_settags_unknown_resource", eventId: "event-1", resourceId: "res-1" },
      "settags event references an unknown resource",
    );
  });

  it("ignores a malformed event without writing", async () => {
    await handleSetTagsEvent(makeEvent(null));

    expect(mocks.saveResourceTags).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      { event: "event_settags_invalid", eventId: "event-1", resourceId: "res-1" },
      "settags event has an invalid payload",
    );
  });
});

describe("Soroban RPC event pagination gaps (#1209)", () => {
  it("detects retention gaps when lastLedger is older than oldestLedger", () => {
    const gaps = detectEventPaginationGaps([], 100, { oldestLedger: 250, latestLedger: 500 });
    expect(gaps.hasRetentionGap).toBe(true);
    expect(gaps.gapLedgers).toBe(150);
    expect(gaps.oldestLedger).toBe(250);
  });

  it("detects no retention gap when lastLedger is within retention window", () => {
    const gaps = detectEventPaginationGaps([], 300, { oldestLedger: 250, latestLedger: 500 });
    expect(gaps.hasRetentionGap).toBe(false);
    expect(gaps.gapLedgers).toBeUndefined();
  });

  it("detects truncation gap when events count equals or exceeds page limit", () => {
    const events = Array(100).fill(makeEvent(["tag"]));
    const gaps = detectEventPaginationGaps(events, 100, { limit: 100 });
    expect(gaps.hasTruncationGap).toBe(true);
    expect(gaps.eventsCount).toBe(100);
  });

  it("detects no truncation gap when events count is below page limit", () => {
    const events = Array(50).fill(makeEvent(["tag"]));
    const gaps = detectEventPaginationGaps(events, 100, { limit: 100 });
    expect(gaps.hasTruncationGap).toBe(false);
    expect(gaps.eventsCount).toBe(50);
  });

  it("handles retention gap during pollEvents by logging actionable error and fast-forwarding", async () => {
    const mockRpc = {
      getEvents: vi
        .fn()
        .mockResolvedValueOnce({
          events: [],
          oldestLedger: 500,
          latestLedger: 600,
        })
        .mockResolvedValueOnce({
          events: [],
          oldestLedger: 500,
          latestLedger: 600,
        }),
    };

    await pollEvents(mockRpc);

    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "event_pagination_gap",
        oldestLedger: 500,
      }),
      expect.stringContaining("retention gap detected"),
    );
  });

  it("paginates using cursor when a full page of events is returned", async () => {
    const firstBatch: SorobanEvent[] = Array.from({ length: 100 }, (_, i) => ({
      ...makeEvent(["tag"]),
      id: `evt-${i}`,
      pagingToken: `token-${i}`,
      ledger: 100,
    }));
    const secondBatch: SorobanEvent[] = [
      {
        ...makeEvent(["final"]),
        id: "evt-final",
        pagingToken: "token-final",
        ledger: 101,
      },
    ];

    const mockRpc = {
      getEvents: vi
        .fn()
        .mockResolvedValueOnce({
          events: firstBatch,
          oldestLedger: 50,
          latestLedger: 200,
        })
        .mockResolvedValueOnce({
          events: secondBatch,
          oldestLedger: 50,
          latestLedger: 200,
        }),
    };

    await pollEvents(mockRpc);

    expect(mockRpc.getEvents).toHaveBeenCalledTimes(2);
    expect(mockRpc.getEvents).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: "token-99",
      }),
    );
  });
});
