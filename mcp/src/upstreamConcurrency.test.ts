import { rpc } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createUpstreamLimiter,
  limitRpcServer,
  limitUpstreamFetch,
  UPSTREAM_CONCURRENCY_ENV,
  upstreamConcurrencyFromEnv,
} from "./upstreamConcurrency.js";

describe("upstream concurrency", () => {
  it("requires a positive safe integer", () => {
    expect(upstreamConcurrencyFromEnv({ [UPSTREAM_CONCURRENCY_ENV]: "2" })).toBe(2);
    for (const value of ["0", "-1", "1.5", "Infinity", "9007199254740992", ""]) {
      expect(() => upstreamConcurrencyFromEnv({ [UPSTREAM_CONCURRENCY_ENV]: value })).toThrow(
        UPSTREAM_CONCURRENCY_ENV,
      );
    }
  });

  it("allows the configured overlap, skips cancelled work and releases failed slots in order", async () => {
    const limit = createUpstreamLimiter(2);
    let rejectFirst!: (error: Error) => void;
    const first = new Promise<void>((_, reject) => {
      rejectFirst = reject;
    });
    let resolveSecond!: () => void;
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    const started = vi.fn();
    const run = (id: string, pending?: Promise<void>, signal?: AbortSignal) =>
      limit(async () => {
        started(id);
        await pending;
      }, signal);
    const a = run("a", first);
    const b = run("b", second);
    const abort = new AbortController();
    const cancelled = run("cancelled", undefined, abort.signal);
    const c = run("c");
    const d = run("d");
    expect(started.mock.calls).toEqual([["a"], ["b"]]);

    abort.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    rejectFirst(new Error("upstream failed"));
    await expect(a).rejects.toThrow("upstream failed");
    await Promise.all([c, d]);
    expect(started.mock.calls).toEqual([["a"], ["b"], ["c"], ["d"]]);
    resolveSecond();
    await b;
  });

  it("uses the same slot for an SDK RPC and the MCP fetch transport", async () => {
    vi.stubEnv(UPSTREAM_CONCURRENCY_ENV, "1");
    try {
      let completeFetch!: (response: Response) => void;
      const fetchResponse = new Promise<Response>((resolve) => {
        completeFetch = resolve;
      });
      const http = limitUpstreamFetch(() => fetchResponse);
      const sdk = new rpc.Server("https://example.com");
      const post = vi
        .spyOn(sdk.httpClient, "post")
        .mockResolvedValue({ data: { result: { status: "healthy" } } });
      const pending = http("https://example.com");
      const health = limitRpcServer(sdk).getHealth();
      expect(post).not.toHaveBeenCalled();
      completeFetch(new Response());
      await expect(health).resolves.toMatchObject({ status: "healthy" });
      await pending;
      expect(post).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
