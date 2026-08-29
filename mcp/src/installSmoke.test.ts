/**
 * Tests for the fixture-backed install smoke check.
 *
 * The scenario itself is data, so it is driven here against a fake MCP client:
 * a happy install passes every step, and each way an install can be broken
 * (missing tool, unset mock mode, rejected argument, tool error) fails at the
 * step that owns it, with a message naming the cause.
 *
 * `scripts/install-smoke.ts` runs the same steps against the real server over
 * stdio; see docs/mcp-smoke-test.md.
 */
import { describe, it, expect } from "vitest";
import {
  buildInstallSmokeSteps,
  checkToolSurface,
  formatInstallSmokeReport,
  installSmokeEnv,
  FIXTURE_RESOURCE_ID,
  REQUIRED_INSTALL_TOOLS,
} from "./installSmoke.js";
import { runSmoke, type SmokeToolClient, type ToolCallResult } from "./smoke.js";

function textResult(text: string, isError = false): ToolCallResult {
  return { content: [{ type: "text", text }], isError };
}

/** Responses a correctly installed, mock-backed server returns. */
function healthyResponses(): Record<string, ToolCallResult> {
  return {
    mindvault_verify_install: textResult(
      "✓ MindVault MCP install OK.\n\n✓ Node.js v20.11.0 (>= v20 required) ✓",
    ),
    mindvault_browse: textResult(`[${FIXTURE_RESOURCE_ID}] Intro to Stellar — $1.5 USDC`),
    mindvault_search: textResult(`[${FIXTURE_RESOURCE_ID}] Intro to Stellar — $1.5 USDC`),
    mindvault_preview: textResult(JSON.stringify({ id: FIXTURE_RESOURCE_ID, price: "$1.5 USDC" })),
    mindvault_registry_lookup: textResult(JSON.stringify({ found: true }, null, 2)),
    mindvault_export_receipts: textResult(
      JSON.stringify({ schema: "mindvault.receipt-export/v1", count: 0 }, null, 2),
    ),
  };
}

function fakeClient(responses: Record<string, ToolCallResult>): {
  client: SmokeToolClient;
  calls: { name: string; args: unknown }[];
} {
  const calls: { name: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      callTool: async ({ name, arguments: args }) => {
        calls.push({ name, args });
        const entry = responses[name];
        if (!entry) throw new Error(`no fake response for ${name}`);
        return entry;
      },
    },
  };
}

describe("checkToolSurface", () => {
  it("passes when every required tool is advertised", () => {
    const result = checkToolSurface([...REQUIRED_INSTALL_TOOLS, "mindvault_metrics"]);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.advertised).toBe(REQUIRED_INSTALL_TOOLS.length + 1);
  });

  it("names the tools a half-installed server fails to advertise", () => {
    const result = checkToolSurface(["mindvault_browse"]);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("mindvault_verify_install");
    expect(result.missing).not.toContain("mindvault_browse");
  });

  it("fails an install that boots but advertises nothing", () => {
    expect(checkToolSurface([]).ok).toBe(false);
  });
});

describe("installSmokeEnv", () => {
  it("isolates agent state and turns on the fixtures", () => {
    const env = installSmokeEnv("/tmp/scratch-home", {});
    expect(env.HOME).toBe("/tmp/scratch-home");
    expect(env.USERPROFILE).toBe("/tmp/scratch-home");
    expect(env.MINDVAULT_MOCK).toBe("1");
    expect(env.STELLAR_NETWORK).toBe("testnet");
    expect(env.MINDVAULT_PURCHASES_FILE).toBe("/tmp/scratch-home/purchases.json");
  });

  it("pins the network even when the operator's environment says mainnet", () => {
    const env = installSmokeEnv("/tmp/h", { STELLAR_NETWORK: "mainnet", PATH: "/usr/bin" });
    expect(env.STELLAR_NETWORK).toBe("testnet");
    expect(env.PATH).toBe("/usr/bin");
  });

  it("drops secret-looking variables so the install check stays deterministic", () => {
    const env = installSmokeEnv("/tmp/h", {
      STELLAR_SECRET_KEY: "S...",
      MY_PRIVATE_KEY: "x",
      WALLET_MNEMONIC: "y",
      MINDVAULT_URL: "https://example.com",
    });
    expect(env.STELLAR_SECRET_KEY).toBeUndefined();
    expect(env.MY_PRIVATE_KEY).toBeUndefined();
    expect(env.WALLET_MNEMONIC).toBeUndefined();
    expect(env.MINDVAULT_URL).toBe("https://example.com");
  });
});

describe("install smoke scenario", () => {
  it("passes against a healthy fixture-backed install", async () => {
    const { client, calls } = fakeClient(healthyResponses());
    const report = await runSmoke(client, buildInstallSmokeSteps());

    expect(report.ok).toBe(true);
    expect(report.steps.every((s) => s.ok)).toBe(true);
    // Read-only: an install check must never publish, pay, or write on-chain.
    expect(calls.map((c) => c.name)).not.toContain("mindvault_publish");
    expect(calls.map((c) => c.name)).not.toContain("mindvault_buy");
  });

  it("asks for the catalog sorted, so an unaccepted sort argument fails the run", async () => {
    const steps = buildInstallSmokeSteps();
    const sorted = steps.find((s) => s.label === "Browse sorted by price");
    expect(sorted?.args).toEqual({ sort: "price_asc", limit: 10 });

    const responses = healthyResponses();
    let call = 0;
    const client: SmokeToolClient = {
      callTool: async ({ name }) => {
        if (name === "mindvault_browse" && ++call === 2) {
          return textResult("Error: sort is not a recognized argument for mindvault_browse", true);
        }
        return responses[name];
      },
    };

    const report = await runSmoke(client, steps);
    expect(report.ok).toBe(false);
    expect(report.failedStep).toBe("Browse sorted by price");
  });

  it("fails when the install cannot verify itself", async () => {
    const responses = healthyResponses();
    responses.mindvault_verify_install = textResult(
      "✗ MindVault MCP install has issues.\n\n✗ Node.js v18.0.0 is below the minimum v20.",
    );
    const { client } = fakeClient(responses);

    const report = await runSmoke(client, buildInstallSmokeSteps());
    expect(report.ok).toBe(false);
    expect(report.failedStep).toBe("Verify install");
  });

  it("fails when fixtures are not serving the catalog", async () => {
    const responses = healthyResponses();
    responses.mindvault_browse = textResult("No resources listed yet.");
    const { client } = fakeClient(responses);

    const report = await runSmoke(client, buildInstallSmokeSteps());
    expect(report.ok).toBe(false);
    expect(report.failedStep).toBe("Browse catalog (fixtures)");
    expect(report.steps.at(-1)?.text).toContain("MINDVAULT_MOCK=1");
  });

  it("fails when the receipt export returns an unversioned document", async () => {
    const responses = healthyResponses();
    responses.mindvault_export_receipts = textResult(JSON.stringify({ count: 0 }));
    const { client } = fakeClient(responses);

    const report = await runSmoke(client, buildInstallSmokeSteps());
    expect(report.ok).toBe(false);
    expect(report.failedStep).toBe("Export receipts");
  });

  it("stops at the first failure instead of running the rest", async () => {
    const responses = healthyResponses();
    responses.mindvault_verify_install = textResult("Error: boom", true);
    const { client, calls } = fakeClient(responses);

    await runSmoke(client, buildInstallSmokeSteps());
    expect(calls.map((c) => c.name)).toEqual(["mindvault_verify_install"]);
  });
});

describe("formatInstallSmokeReport", () => {
  it("summarizes a pass with the entry point that was exercised", () => {
    const line = formatInstallSmokeReport(
      { ok: true, steps: [{ label: "a", tool: "t", ok: true, text: "" }] },
      "dist/index.js",
    );
    expect(line).toContain("✓ install smoke passed");
    expect(line).toContain("dist/index.js");
  });

  it("names the failed step", () => {
    const line = formatInstallSmokeReport(
      { ok: false, steps: [], failedStep: "Browse catalog (fixtures)" },
      "dist/index.js",
    );
    expect(line).toContain("✗ install smoke failed");
    expect(line).toContain("Browse catalog (fixtures)");
  });
});
