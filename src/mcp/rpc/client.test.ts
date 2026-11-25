import { describe, expect, it } from "vitest";
import { RegistryRpcClient, RpcContextError } from "./client.js";

describe("RegistryRpcClient request context", () => {
  it("binds concurrent responses to their own request ids", async () => {
    const pending = new Map<number, (body: string) => void>();
    const fetchImpl = (_url: string, init: { body: string }) => {
      const request = JSON.parse(init.body) as { id: number };
      return new Promise<{ ok: boolean; status: number; text(): Promise<string }>((resolve) => {
        pending.set(request.id, (body) => resolve({
          ok: true,
          status: 200,
          text: async () => body,
        }));
      });
    };
    const client = new RegistryRpcClient("https://registry.example/rpc", fetchImpl);

    const first = client.call<{ value: string }>("first", {});
    const second = client.call<{ value: string }>("second", {});
    pending.get(2)?.('{"jsonrpc":"2.0","id":2,"result":{"value":"second"}}');
    pending.get(1)?.('{"jsonrpc":"2.0","id":1,"result":{"value":"first"}}');

    await expect(second).resolves.toEqual({ value: "second" });
    await expect(first).resolves.toEqual({ value: "first" });
  });

  it("rejects a response carrying another in-flight request id", async () => {
    const client = new RegistryRpcClient("https://registry.example/rpc", async () => ({
      ok: true,
      status: 200,
      text: async () => '{"jsonrpc":"2.0","id":99,"result":{"value":"wrong"}}',
    }));

    await expect(client.call("one", {})).rejects.toBeInstanceOf(RpcContextError);
  });

  it("rejects a response with a missing or mismatched JSON-RPC version", async () => {
    const client = new RegistryRpcClient("https://registry.example/rpc", async () => ({
      ok: true,
      status: 200,
      text: async () => '{"jsonrpc":"1.0","id":1,"result":true}',
    }));

    await expect(client.call("one", {})).rejects.toThrow("invalid JSON-RPC version");
  });
});
