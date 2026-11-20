/**
 * Replay-safe progress notifications (#1061).
 *
 * A transport that resumes a stream after a reconnect can deliver the same
 * progress notification twice. These tests check that every notification
 * carries a stable event id and sequence number, and that a client using them
 * counts one publish or payment as exactly the steps the server reported.
 *
 * The session tests drive a real `Server` from the factory against a real
 * `Client` over the SDK's in-memory pair; the reconnect is simulated by a
 * server transport that re-sends the events it already wrote, as a resumable
 * transport does when a client reconnects with a stale `Last-Event-ID`.
 */
import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMindVaultServer, type ServerBehaviour } from "./serverFactory.js";
import {
  PROGRESS_EVENT_META_KEY,
  createProgressDeduplicator,
  createProgressEmitter,
  progressEventOf,
  sequenceProgressNotifications,
  type SendNotification,
} from "./progress.js";

const TOOL = {
  name: "mindvault_pay",
  description: "Pretend to pay.",
  inputSchema: { type: "object" as const, properties: {} },
};

const PAYMENT_STEPS: [number, number, string][] = [
  [1, 4, "Validating resource"],
  [2, 4, "Submitting payment"],
  [3, 4, "Recording purchase"],
  [4, 4, "Done"],
];

function progressNotification(progress: number, total?: number, message?: string) {
  return {
    method: "notifications/progress" as const,
    params: { progressToken: "tok", progress, total, message },
  };
}

describe("sequenceProgressNotifications", () => {
  it("stamps each progress notification with a stream id, sequence, and event id", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const stamped = sequenceProgressNotifications(send, "stream-1");

    await stamped(progressNotification(1, 3, "a"));
    await stamped(progressNotification(2, 3, "b"));

    expect(send.mock.calls.map(([n]) => n.params._meta[PROGRESS_EVENT_META_KEY])).toEqual([
      { streamId: "stream-1", sequence: 1, eventId: "stream-1:1" },
      { streamId: "stream-1", sequence: 2, eventId: "stream-1:2" },
    ]);
  });

  it("leaves the standard progress fields unchanged for clients that ignore _meta", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await sequenceProgressNotifications(send, "s")(progressNotification(2, 4, "Submitting"));

    const { _meta, ...rest } = send.mock.calls[0][0].params;
    expect(rest).toEqual({ progressToken: "tok", progress: 2, total: 4, message: "Submitting" });
    expect(_meta).toBeDefined();
  });

  it("does not send an update that repeats or goes back on earlier progress", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const stamped = sequenceProgressNotifications(send, "s");

    await stamped(progressNotification(1, 4, "Validating"));
    await stamped(progressNotification(2, 4, "Submitting payment"));
    await stamped(progressNotification(2, 4, "Submitting payment"));
    await stamped(progressNotification(1, 4, "Validating"));
    await stamped(progressNotification(3, 4, "Recording"));

    expect(
      send.mock.calls.map(([n]) => [
        n.params.progress,
        n.params._meta[PROGRESS_EVENT_META_KEY].sequence,
      ]),
    ).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it("passes other notifications through untouched", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const log = { method: "notifications/message", params: { level: "info", data: "x" } };

    await sequenceProgressNotifications(send, "s")(log);

    expect(send).toHaveBeenCalledWith(log);
  });

  it("keeps any _meta the notification already carried", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await sequenceProgressNotifications(
      send,
      "s",
    )({
      method: "notifications/progress",
      params: { progressToken: "tok", progress: 1, _meta: { other: true } },
    });

    expect(send.mock.calls[0][0].params._meta.other).toBe(true);
  });

  it("gives each call its own stream id by default", async () => {
    const sent: unknown[] = [];
    const send = async (n: unknown) => void sent.push(n);
    await sequenceProgressNotifications(send)(progressNotification(1));
    await sequenceProgressNotifications(send)(progressNotification(1));

    const [a, b] = sent.map((n: any) => progressEventOf(n.params)!);
    expect(a.streamId).not.toBe(b.streamId);
    expect(a.eventId).not.toBe(b.eventId);
  });
});

describe("createProgressDeduplicator", () => {
  const stamp = (streamId: string, sequence: number, progress = sequence) => ({
    progressToken: "tok",
    progress,
    _meta: {
      [PROGRESS_EVENT_META_KEY]: { streamId, sequence, eventId: `${streamId}:${sequence}` },
    },
  });

  it("accepts each event once and rejects a replay of it", () => {
    const isNew = createProgressDeduplicator();
    expect(isNew(stamp("s", 1))).toBe(true);
    expect(isNew(stamp("s", 2))).toBe(true);
    expect(isNew(stamp("s", 1))).toBe(false);
    expect(isNew(stamp("s", 2))).toBe(false);
    expect(isNew(stamp("s", 3))).toBe(true);
  });

  it("tracks separate calls independently", () => {
    const isNew = createProgressDeduplicator();
    expect(isNew(stamp("a", 1))).toBe(true);
    expect(isNew(stamp("b", 1))).toBe(true);
    expect(isNew({ ...stamp("a", 1), progressToken: "other" })).toBe(true);
  });

  it("falls back to strictly increasing progress for an unstamped notification", () => {
    const isNew = createProgressDeduplicator();
    expect(isNew({ progressToken: 7, progress: 1 })).toBe(true);
    expect(isNew({ progressToken: 7, progress: 1 })).toBe(false);
    expect(isNew({ progressToken: 7, progress: 2 })).toBe(true);
  });
});

describe("progress across a reconnect that replays events", () => {
  /**
   * A server transport that, after `replayAfter` progress events, behaves as
   * if the client reconnected and the transport resumed from the start of the
   * stream: it re-sends every progress event it has already written, then
   * carries on with new ones.
   */
  function replayOnReconnect(serverTransport: InMemoryTransport, replayAfter: number) {
    const written: any[] = [];
    const send = serverTransport.send.bind(serverTransport);
    let replayed = false;
    serverTransport.send = async (message: any, options?: any) => {
      await send(message, options);
      if (message.method !== "notifications/progress") return;
      written.push(message);
      if (!replayed && written.length === replayAfter) {
        replayed = true;
        for (const event of [...written]) await send(event, options);
      }
    };
    return written;
  }

  async function payWithReplay(replayAfter: number) {
    const behaviour: ServerBehaviour = {
      listTools: () => [TOOL],
      dispatchTool: async (_name, _args, onProgress) => {
        for (const [p, t, m] of PAYMENT_STEPS) await onProgress?.(p, t, m);
        return "paid";
      },
      createProgressEmitter: (token, send) =>
        createProgressEmitter({ token, send: send as SendNotification }),
    };
    const server = createMindVaultServer(behaviour);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    replayOnReconnect(serverTransport, replayAfter);

    const raw: any[] = [];
    const counted: string[] = [];
    const isNew = createProgressDeduplicator();
    const result: any = await client.callTool({ name: TOOL.name, arguments: {} }, undefined, {
      onprogress: (p: any) => {
        raw.push(p);
        if (isNew(p)) counted.push(String(p.message));
      },
    });
    return { result, raw, counted };
  }

  it("lets the client count one payment as exactly its four steps", async () => {
    const { result, raw, counted } = await payWithReplay(2);

    expect(result.content[0].text).toBe("paid");
    // The replay really happened: the client saw steps 1 and 2 twice.
    expect(raw.map((p) => p.message)).toEqual([
      "Validating resource",
      "Submitting payment",
      "Validating resource",
      "Submitting payment",
      "Recording purchase",
      "Done",
    ]);
    expect(counted).toEqual(PAYMENT_STEPS.map(([, , m]) => m));
  });

  it("gives a replayed event the same id as the original", async () => {
    const { raw } = await payWithReplay(2);
    const ids = raw.map((p) => progressEventOf(p)!.eventId);

    expect(ids[2]).toBe(ids[0]);
    expect(ids[3]).toBe(ids[1]);
    expect(new Set(ids).size).toBe(PAYMENT_STEPS.length);
    expect(raw.map((p) => progressEventOf(p)!.sequence)).toEqual([1, 2, 1, 2, 3, 4]);
  });

  it("deduplicates a replay of the final event too", async () => {
    const { counted } = await payWithReplay(PAYMENT_STEPS.length);
    expect(counted).toEqual(PAYMENT_STEPS.map(([, , m]) => m));
  });
});
