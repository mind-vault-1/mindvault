import { describe, it, expect, vi } from "vitest";
import {
  buildSmokeSteps,
  isToolError,
  parseResourceId,
  resultText,
  runSmoke,
  type SmokeToolClient,
  type ToolCallResult,
} from "./smoke.js";

function textResult(text: string, isError = false): ToolCallResult {
  return { content: [{ type: "text", text }], isError };
}

/** A fake MCP client that replays canned results keyed by tool name. */
function fakeClient(responses: Record<string, ToolCallResult | ((args: any) => ToolCallResult)>): {
  client: SmokeToolClient;
  calls: { name: string; args: any }[];
} {
  const calls: { name: string; args: any }[] = [];
  const client: SmokeToolClient = {
    callTool: async ({ name, arguments: args }) => {
      calls.push({ name, args });
      const entry = responses[name];
      if (!entry) throw new Error(`no fake response for ${name}`);
      return typeof entry === "function" ? entry(args) : entry;
    },
  };
  return { client, calls };
}

/** Canned happy-path responses for the full scenario. */
function happyResponses(): Record<string, ToolCallResult | ((args: any) => ToolCallResult)> {
  return {
    mindvault_setup_wallet: textResult("Wallet created.\nAddress: GABC123"),
    mindvault_register: textResult("Registered as publisher.\nID: pub-1"),
    mindvault_publish: textResult(
      "Resource published.\nID: smoke-res-1\nVerification: approved ✓\nOn-chain status: registered",
    ),
    mindvault_preview: (args) =>
      textResult(JSON.stringify({ id: args.resourceId, price: "$0.10" })),
    mindvault_buy: (args) => textResult(JSON.stringify({ id: args.resourceId, content: "ok" })),
  };
}

describe("resultText", () => {
  it("joins text content blocks", () => {
    expect(
      resultText({
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      }),
    ).toBe("a\nb");
  });
  it("tolerates missing content", () => {
    expect(resultText({})).toBe("");
  });
});

describe("isToolError", () => {
  it("flags the isError marker", () => {
    expect(isToolError({ content: [{ type: "text", text: "ok" }], isError: true })).toBe(true);
  });
  it("flags an Error: prefix even without isError", () => {
    expect(isToolError(textResult("Error: no wallet"))).toBe(true);
  });
  it("passes clean results", () => {
    expect(isToolError(textResult("Resource published."))).toBe(false);
  });
});

describe("parseResourceId", () => {
  it("extracts the id from publish output", () => {
    expect(parseResourceId("Resource published.\nID: smoke-res-1\nmore")).toBe("smoke-res-1");
  });
  it("returns null when absent", () => {
    expect(parseResourceId("no id here")).toBeNull();
  });
});

describe("runSmoke", () => {
  it("runs every step and threads the resource id into preview and buy", async () => {
    const { client, calls } = fakeClient(happyResponses());
    const report = await runSmoke(client, buildSmokeSteps());

    expect(report.ok).toBe(true);
    expect(report.steps.map((s) => s.tool)).toEqual([
      "mindvault_setup_wallet",
      "mindvault_register",
      "mindvault_publish",
      "mindvault_preview",
      "mindvault_buy",
    ]);
    const previewCall = calls.find((c) => c.name === "mindvault_preview");
    const buyCall = calls.find((c) => c.name === "mindvault_buy");
    expect(previewCall?.args).toEqual({ resourceId: "smoke-res-1" });
    expect(buyCall?.args).toEqual({ resourceId: "smoke-res-1" });
  });

  it("fails and stops at the first tool that returns isError", async () => {
    const responses = happyResponses();
    responses.mindvault_publish = textResult("Error: not registered", true);
    const { client, calls } = fakeClient(responses);

    const report = await runSmoke(client, buildSmokeSteps());

    expect(report.ok).toBe(false);
    expect(report.failedStep).toBe("Publish resource");
    // buy/preview must not run once publish fails
    expect(calls.map((c) => c.name)).not.toContain("mindvault_buy");
  });

  it("fails when publish returns a soft error (e.g. insufficient funds) that skips the id", async () => {
    const responses = happyResponses();
    responses.mindvault_publish = textResult(
      "Insufficient USDC to pay the content verification fee.\n(Resource created with id smoke-res-1; verify it later once funded.)",
    );
    const { client } = fakeClient(responses);

    const report = await runSmoke(client, buildSmokeSteps());

    expect(report.ok).toBe(false);
    expect(report.failedStep).toBe("Publish resource");
  });

  it("fails when the transport throws", async () => {
    const client: SmokeToolClient = {
      callTool: () => Promise.reject(new Error("broken pipe")),
    };
    const report = await runSmoke(client, buildSmokeSteps());

    expect(report.ok).toBe(false);
    expect(report.failedStep).toBe("Set up wallet");
    expect(report.steps[0].text).toContain("broken pipe");
  });

  it("emits a log line per step", async () => {
    const { client } = fakeClient(happyResponses());
    const log = vi.fn();
    await runSmoke(client, buildSmokeSteps(), log);
    const lines = log.mock.calls.map((c) => c[0] as string);
    expect(lines.some((l) => l.includes("✓ Buy resource"))).toBe(true);
  });
});
