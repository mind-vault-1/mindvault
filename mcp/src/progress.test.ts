/**
 * Tests for progress notifications on long-running tools (#554).
 *
 * Verifies that `createProgressEmitter` correctly emits or suppresses
 * notifications based on whether a progress token is supplied.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: class MockServer {
    setRequestHandler = vi.fn();
    connect = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {
    constructor() {}
  },
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  CallToolRequestSchema: {},
  ListToolsRequestSchema: {},
  ListPromptsRequestSchema: {},
  GetPromptRequestSchema: {},
  ListResourcesRequestSchema: {},
  ReadResourceRequestSchema: {},
}));

vi.mock("@x402/stellar", () => ({ createEd25519Signer: vi.fn() }));
vi.mock("@x402/stellar/exact/client", () => ({ ExactStellarScheme: vi.fn() }));
vi.mock("@x402/fetch", () => ({
  wrapFetchWithPayment: vi.fn(),
  x402Client: vi.fn(function () {
    return { register: vi.fn() };
  }),
}));

vi.mock("@mindvault/registry-client", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    networks: {
      ...actual.networks,
      testnet: {
        ...actual.networks.testnet,
        contractId: "test",
        networkPassphrase: "test",
      },
    },
  };
});

import { createProgressEmitter, type ProgressContext } from "./progress.js";

// ── createProgressEmitter unit tests ────────────────────────────────────────

describe("createProgressEmitter", () => {
  it("returns a no-op function when no token is supplied", async () => {
    const emit = createProgressEmitter({ token: undefined, send: vi.fn() as any });
    await emit(1, 4, "step");
  });

  it("calls sendNotification with the correct progress payload", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const emit = createProgressEmitter({ token: "abc-123", send });

    await emit(2, 4, "Processing");

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
      method: "notifications/progress",
      params: {
        progressToken: "abc-123",
        progress: 2,
        total: 4,
        message: "Processing",
      },
    });
  });

  it("omits total and message when not provided", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const emit = createProgressEmitter({ token: 42, send });

    await emit(1);

    expect(send).toHaveBeenCalledWith({
      method: "notifications/progress",
      params: {
        progressToken: 42,
        progress: 1,
      },
    });
  });

  it("supports numeric progress tokens", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const emit = createProgressEmitter({ token: 999, send });

    await emit(3, 5, "step");

    expect(send).toHaveBeenCalledWith({
      method: "notifications/progress",
      params: {
        progressToken: 999,
        progress: 3,
        total: 5,
        message: "step",
      },
    });
  });

  it("supports string progress tokens", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const emit = createProgressEmitter({ token: "tok-xyz", send });

    await emit(1, 2, "init");

    expect(send).toHaveBeenCalledWith({
      method: "notifications/progress",
      params: {
        progressToken: "tok-xyz",
        progress: 1,
        total: 2,
        message: "init",
      },
    });
  });

  it("calls send for every invocation", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const emit = createProgressEmitter({ token: "multi", send });

    await emit(1, 4, "a");
    await emit(2, 4, "b");
    await emit(3, 4, "c");
    await emit(4, 4, "d");

    expect(send).toHaveBeenCalledTimes(4);
  });
});
