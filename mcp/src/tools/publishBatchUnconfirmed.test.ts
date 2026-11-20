/**
 * mindvault_publish_batch keeps the register_batch hash when confirming it
 * fails (#1060).
 *
 * By the time register_batch is sent, every item has been created and paid
 * for through the API. When the RPC dropped after submit, the tool used to
 * throw — losing both the transaction hash and the per-item results — and an
 * agent that retried published everything again. The API and payment calls
 * are stubbed here; the on-chain send runs the SDK's own `SentTransaction`.
 */
import { describe, expect, it, vi } from "vitest";
import { Keypair, contract } from "@stellar/stellar-sdk";

import { outputContractViolation } from "../outputValidation.js";
import type { SubmissionWatcher } from "../submittedTransaction.js";
import { TOOL_DEFINITIONS } from "../tools.js";

const HASH = "ba7c4".padEnd(64, "0");
const rpc = vi.hoisted(() => ({ lost: true }));
const wallet = vi.hoisted(() => ({ publicKey: "", secretKey: "" }));

vi.mock("../runtime.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  let created = 0;
  return {
    ...actual,
    _isMock: () => false,
    requireWallet: () => wallet,
    requireApiKey: () => "api-key",
    jsonFetch: async (url: string) => {
      if (url.endsWith("/resources")) {
        created += 1;
        return { ok: true, status: 201, data: { id: `res-${created}`, accessUrl: null } };
      }
      return { ok: false, status: 404, data: null }; // /agent/status: skip the funds check
    },
    makePaidFetch: () => async () =>
      new Response(JSON.stringify({ isOriginal: true, flags: [] }), { status: 200 }),
  };
});

vi.mock("@mindvault/registry-client", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createRegistryClient: () => ({
      register_batch: async () => ({
        result: {
          isErr: () => false,
          unwrap: () => ({ failed: [] }), // every verified item succeeded
        },
        signAndSend: (opts: { watcher?: SubmissionWatcher }) => {
          const server = {
            sendTransaction: async () => ({ status: "PENDING", hash: HASH }),
            getTransaction: async () => {
              if (rpc.lost) throw new Error("fetch failed: ECONNRESET");
              return { status: "SUCCESS" };
            },
          };
          const assembled = { options: { server, timeoutInSeconds: 1 }, signed: {} };
          return (new contract.SentTransaction(assembled as any) as any).send(opts.watcher as any);
        },
      }),
    }),
  };
});

const { publishBatch } = await import("./publish.js");

const ITEMS = [
  { title: "One", price: "1", externalUrl: "https://example.com/1" },
  { title: "Two", price: "2", externalUrl: "https://example.com/2" },
];

function useWallet() {
  const kp = Keypair.random();
  wallet.publicKey = kp.publicKey();
  wallet.secretKey = kp.secret();
}

describe("publishBatch when register_batch cannot be confirmed", () => {
  it("returns the published items with the hash and a status lookup", async () => {
    useWallet();
    rpc.lost = true;
    const summary = JSON.parse(await publishBatch(ITEMS));

    expect(summary).toMatchObject({
      requested: 2,
      verified: 2,
      onchainStatus: "submitted",
      txHash: HASH,
      statusLookup: { tool: "mindvault_tx_status", arguments: { txHash: HASH }, retryable: true },
    });
    expect(summary.items.map((i: any) => i.onchainStatus)).toEqual(["submitted", "submitted"]);
    // The payload honours the tool's advertised output schema (#1062).
    const schema = TOOL_DEFINITIONS.find((t) => t.name === "mindvault_publish_batch")!.outputSchema;
    expect(
      outputContractViolation(
        { content: [{ type: "text", text: "" }], structuredContent: summary },
        schema,
      ),
    ).toBeUndefined();
  });

  it("still reports registered items when the batch confirms", async () => {
    useWallet();
    rpc.lost = false;
    const summary = JSON.parse(await publishBatch(ITEMS));

    expect(summary.onchainStatus).toBe("registered");
    expect(summary.txHash).toBe(HASH);
    expect(summary.statusLookup).toBeUndefined();
    expect(summary.items.every((i: any) => i.onchainStatus === "registered")).toBe(true);
  });
});
