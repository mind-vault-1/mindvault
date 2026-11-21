/**
 * mindvault_upstream_health (#1205): single-attempt, parallel probe of every
 * configured upstream.
 */
import { describe, expect, it, vi } from "vitest";
import {
  displayUrl,
  formatUpstreamProbe,
  probeUpstreams,
  type UpstreamProbeInput,
} from "./upstreamProbe.js";
import { UPSTREAM_HEALTH_OUTPUT_SCHEMA } from "./outputSchemas.js";
import { checkOutput } from "./outputValidation.js";
import { ToolValidationError, validateToolArgs } from "./validation.js";

const TESTNET = "Test SDF Network ; September 2015";
const MAINNET = "Public Global Stellar Network ; September 2015";

const URLS = {
  api: "https://api.example",
  horizon: "https://horizon.example",
  soroban_rpc: "https://rpc.example",
  sponsored_account: "https://sponsor.example",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function healthyHandler(overrides: Partial<Record<keyof typeof URLS, Handler>> = {}): Handler {
  return (url, init) => {
    for (const [id, base] of Object.entries(URLS) as [keyof typeof URLS, string][]) {
      if (url.startsWith(base)) {
        if (overrides[id]) return overrides[id]!(url, init);
        if (id === "horizon") return json({ network_passphrase: TESTNET });
        if (id === "soroban_rpc")
          return json({ jsonrpc: "2.0", id: 1, result: { passphrase: TESTNET } });
        return json([]);
      }
    }
    throw new Error(`unexpected url ${url}`);
  };
}

function input(handler: Handler, extra: Partial<UpstreamProbeInput> = {}): UpstreamProbeInput {
  let t = 0;
  return {
    profile: "default",
    expectedNetworkPassphrase: TESTNET,
    urls: URLS,
    fetch: vi.fn(async (url: string, init: RequestInit) => handler(url, init)),
    now: () => (t += 10),
    ...extra,
  };
}

describe("probeUpstreams", () => {
  it("reports healthy when every upstream answers on the configured network", async () => {
    const report = await probeUpstreams(input(healthyHandler()));
    expect(report.verdict).toBe("healthy");
    expect(report.upstreams.map((u) => [u.id, u.status])).toEqual([
      ["api", "ok"],
      ["horizon", "ok"],
      ["soroban_rpc", "ok"],
      ["sponsored_account", "ok"],
    ]);
    const horizon = report.upstreams[1];
    expect(horizon).toMatchObject({
      httpStatus: 200,
      networkPassphrase: TESTNET,
      networkMatch: true,
    });
    expect(horizon.latencyMs).toBeGreaterThanOrEqual(0);
    expect(checkOutput(UPSTREAM_HEALTH_OUTPUT_SCHEMA as any, report)).toEqual({ valid: true });
  });

  it("makes exactly one request per upstream, in parallel", async () => {
    const resolvers: Array<() => void> = [];
    const handler: Handler = (url, init) =>
      new Promise<Response>((resolve) =>
        resolvers.push(() => resolve(healthyHandler()(url, init) as Response)),
      );
    const pending = probeUpstreams(input(handler));
    await vi.waitFor(() => expect(resolvers).toHaveLength(4));
    resolvers.forEach((r) => r());
    const report = await pending;
    expect(report.counts.ok).toBe(4);
  });

  it("probes Soroban RPC with getNetwork and never calls the sponsored create path", async () => {
    const i = input(healthyHandler());
    await probeUpstreams(i);
    const calls = (i.fetch as any).mock.calls as [string, RequestInit][];
    const rpc = calls.find(([u]) => u.startsWith(URLS.soroban_rpc))!;
    expect(rpc[1].method).toBe("POST");
    expect(JSON.parse(String(rpc[1].body)).method).toBe("getNetwork");
    const sponsor = calls.find(([u]) => u.startsWith(URLS.sponsored_account))!;
    expect(sponsor[0]).toBe(URLS.sponsored_account);
    expect(sponsor[1].method).toBe("GET");
  });

  it("flags a network mismatch as degraded with an action", async () => {
    const report = await probeUpstreams(
      input(healthyHandler({ horizon: () => json({ network_passphrase: MAINNET }) })),
    );
    expect(report.verdict).toBe("degraded");
    expect(report.upstreams[1]).toMatchObject({
      status: "degraded",
      networkMatch: false,
      networkPassphrase: MAINNET,
    });
    expect(report.upstreams[1].action).toContain("HORIZON_URL");
  });

  it("treats an HTTP error as degraded and a transport failure as down", async () => {
    const report = await probeUpstreams(
      input(
        healthyHandler({
          sponsored_account: () => json({ error: "boom" }, 503),
          soroban_rpc: () => {
            throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
          },
        }),
      ),
    );
    expect(report.verdict).toBe("unhealthy");
    expect(report.upstreams[2]).toMatchObject({
      status: "down",
      httpStatus: null,
      latencyMs: null,
      error: "Connection failed (ECONNREFUSED).",
    });
    expect(report.upstreams[2].action).toContain("SOROBAN_RPC_URL");
    expect(report.upstreams[3]).toMatchObject({ status: "degraded", httpStatus: 503 });
  });

  it("an unhealthy optional sponsored service only degrades the verdict", async () => {
    const report = await probeUpstreams(
      input(
        healthyHandler({
          sponsored_account: () => {
            throw new TypeError("fetch failed");
          },
        }),
      ),
    );
    expect(report.verdict).toBe("degraded");
  });

  it("times out a hung upstream after timeoutMs without retrying", async () => {
    const hung: Handler = (_url, init) =>
      new Promise((_, reject) =>
        (init.signal as AbortSignal).addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        ),
      );
    const i = input(healthyHandler({ api: hung }), { timeoutMs: 100 });
    const report = await probeUpstreams(i);
    expect(report.upstreams[0]).toMatchObject({
      status: "down",
      error: "No response within 100ms.",
    });
    const apiCalls = (i.fetch as any).mock.calls.filter(([u]: [string]) => u.startsWith(URLS.api));
    expect(apiCalls).toHaveLength(1);
  });

  it("reports unconfigured and skipped upstreams without calling them", async () => {
    const i = input(healthyHandler(), {
      urls: { ...URLS, sponsored_account: "" },
      only: ["horizon", "sponsored_account"],
    });
    const report = await probeUpstreams(i);
    expect(report.upstreams.map((u) => u.status)).toEqual([
      "skipped",
      "ok",
      "skipped",
      "not_configured",
    ]);
    expect(report.upstreams[3].action).toContain("SPONSORED_ACCOUNT_URL");
    expect((i.fetch as any).mock.calls).toHaveLength(1);
    expect(report.verdict).toBe("healthy");
  });

  it("is unhealthy when a required upstream is not configured", async () => {
    const report = await probeUpstreams(
      input(healthyHandler(), { urls: { ...URLS, horizon: null } }),
    );
    expect(report.verdict).toBe("unhealthy");
  });

  it("clamps timeoutMs into the supported range", async () => {
    expect((await probeUpstreams(input(healthyHandler(), { timeoutMs: 1 }))).timeoutMs).toBe(100);
    expect((await probeUpstreams(input(healthyHandler(), { timeoutMs: 10 ** 9 }))).timeoutMs).toBe(
      30_000,
    );
  });

  it("never shows credentials or query strings in URLs", async () => {
    expect(displayUrl("https://user:pw@rpc.example/path?apikey=SECRET#x")).toBe(
      "https://rpc.example/path",
    );
    expect(displayUrl("not a url")).toBe("(invalid URL)");
    const report = await probeUpstreams(
      input(healthyHandler(), {
        urls: { ...URLS, soroban_rpc: "https://k:SECRET@rpc.example?key=SECRET" },
      }),
    );
    expect(JSON.stringify(report)).not.toContain("SECRET");
    expect(formatUpstreamProbe(report)).not.toContain("SECRET");
  });

  it("renders a verdict line and one line per upstream", async () => {
    const text = formatUpstreamProbe(await probeUpstreams(input(healthyHandler())));
    expect(text.split("\n")[0]).toBe(
      "Verdict: healthy — All probed upstreams are reachable and on the configured network.",
    );
    expect(text).toContain("✓ Horizon (https://horizon.example): ok, HTTP 200");
  });
});

describe("mindvault_upstream_health argument validation", () => {
  const issues = (args: Record<string, unknown>) => {
    try {
      validateToolArgs("mindvault_upstream_health", args);
      return [];
    } catch (err) {
      expect(err).toBeInstanceOf(ToolValidationError);
      return (err as ToolValidationError).issues.map((i) => `${i.field}:${i.code}`);
    }
  };

  it("accepts no arguments, a subset and a timeout", () => {
    expect(issues({})).toEqual([]);
    expect(issues({ upstreams: ["api", "horizon"], timeoutMs: 2000 })).toEqual([]);
  });

  it("rejects unknown upstreams, out-of-range timeouts and unknown arguments", () => {
    expect(issues({ upstreams: ["redis"] })).toEqual(["upstreams:invalid_string_array"]);
    expect(issues({ timeoutMs: 50 })[0]).toMatch(/^timeoutMs:/);
    expect(issues({ url: "https://evil.example" })).toEqual(["url:unknown_argument"]);
  });
});
