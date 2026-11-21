/**
 * Operator health probe for every configured upstream (#1205).
 *
 * mindvault_registry_health checks reachability with retries and returns
 * text, and mindvault_rpc_health covers only Horizon and Soroban RPC. An
 * operator debugging a deployment needs one answer to "which upstream is
 * broken right now, and is each one on the network I configured?". This
 * probe gives that answer:
 *
 *  - It covers the MindVault API, Horizon, Soroban RPC and the sponsored
 *    account service.
 *  - It makes a single attempt per upstream, with no retries, so latency is
 *    what one request costs and a flaky upstream is not hidden.
 *  - The upstreams are probed in parallel, so the probe takes as long as the
 *    slowest one, not the sum.
 *  - Horizon and Soroban RPC report their network passphrase, which is
 *    compared with the configured one.
 *  - It reports one verdict: healthy, degraded or unhealthy.
 *
 * The module is pure: fetch and the clock are injected. Results always come
 * in the same fixed order, and URLs are reported without credentials, query
 * strings or fragments.
 */

export const UPSTREAM_IDS = ["api", "horizon", "soroban_rpc", "sponsored_account"] as const;
export type UpstreamId = (typeof UPSTREAM_IDS)[number];

export const UPSTREAM_PROBE_MIN_TIMEOUT_MS = 100;
export const UPSTREAM_PROBE_MAX_TIMEOUT_MS = 30_000;
export const UPSTREAM_PROBE_DEFAULT_TIMEOUT_MS = 5_000;

const UPSTREAM_NAMES: Record<UpstreamId, string> = {
  api: "MindVault API",
  horizon: "Horizon",
  soroban_rpc: "Soroban RPC",
  sponsored_account: "Sponsored account service",
};

const UPSTREAM_ENV: Record<UpstreamId, string> = {
  api: "MINDVAULT_URL",
  horizon: "HORIZON_URL",
  soroban_rpc: "SOROBAN_RPC_URL",
  sponsored_account: "SPONSORED_ACCOUNT_URL",
};

/**
 * `ok`: answered 2xx on the expected network. `degraded`: answered, but with
 * a non-2xx status or a different network. `down`: no answer (DNS, refused,
 * timeout). `not_configured`: no URL. `skipped`: not requested.
 */
export type UpstreamStatus = "ok" | "degraded" | "down" | "not_configured" | "skipped";
export type UpstreamVerdict = "healthy" | "degraded" | "unhealthy";

export interface UpstreamProbeResult {
  id: UpstreamId;
  name: string;
  url: string | null;
  status: UpstreamStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  networkPassphrase: string | null;
  networkMatch: boolean | null;
  error: string | null;
  action: string | null;
}

export interface UpstreamProbeReport {
  profile: string;
  expectedNetworkPassphrase: string;
  timeoutMs: number;
  verdict: UpstreamVerdict;
  counts: Record<UpstreamStatus, number>;
  upstreams: UpstreamProbeResult[];
  summary: string;
}

export interface UpstreamProbeInput {
  profile: string;
  expectedNetworkPassphrase: string;
  urls: Record<UpstreamId, string | null | undefined>;
  fetch: (url: string, init: RequestInit & { signal: AbortSignal }) => Promise<Response>;
  /** Monotonic clock in ms; defaults to performance.now(). */
  now?: () => number;
  /** Probe only these upstreams. Default: all. */
  only?: readonly UpstreamId[];
  timeoutMs?: number;
  userAgent?: string;
}

/** A URL safe to show: no userinfo, query string or fragment. */
export function displayUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = "";
    u.password = "";
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "(invalid URL)";
  }
}

function joinPath(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

/** The request each upstream is probed with, and how to read its identity. */
function requestFor(id: UpstreamId, base: string, userAgent: string) {
  const headers: Record<string, string> = { "User-Agent": userAgent, Accept: "application/json" };
  switch (id) {
    case "api":
      return { url: joinPath(base, "/resources?limit=1"), init: { method: "GET", headers } };
    case "horizon":
      return { url: base, init: { method: "GET", headers } };
    case "soroban_rpc":
      return {
        url: base,
        init: {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getNetwork", params: {} }),
        },
      };
    case "sponsored_account":
      // Only reachability: the service has no read-only identity endpoint,
      // and the create path must never be called by a health probe.
      return { url: base, init: { method: "GET", headers } };
  }
}

function passphraseFrom(id: UpstreamId, body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, any>;
  if (id === "horizon")
    return typeof b.network_passphrase === "string" ? b.network_passphrase : null;
  if (id === "soroban_rpc") {
    const r = b.result;
    if (r && typeof r === "object") {
      if (typeof r.passphrase === "string") return r.passphrase;
      if (typeof r.networkPassphrase === "string") return r.networkPassphrase;
    }
  }
  return null;
}

function transportMessage(err: unknown, timeoutMs: number): string {
  if (err && typeof err === "object" && (err as { name?: string }).name === "AbortError") {
    return `No response within ${timeoutMs}ms.`;
  }
  const code = (err as { cause?: { code?: string } })?.cause?.code;
  if (typeof code === "string") return `Connection failed (${code}).`;
  return "Connection failed.";
}

async function probeOne(
  id: UpstreamId,
  base: string,
  input: Required<
    Pick<
      UpstreamProbeInput,
      "fetch" | "now" | "timeoutMs" | "userAgent" | "expectedNetworkPassphrase"
    >
  >,
): Promise<UpstreamProbeResult> {
  const { url, init } = requestFor(id, base, input.userAgent);
  const result: UpstreamProbeResult = {
    id,
    name: UPSTREAM_NAMES[id],
    url: displayUrl(base),
    status: "down",
    httpStatus: null,
    latencyMs: null,
    networkPassphrase: null,
    networkMatch: null,
    error: null,
    action: null,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const started = input.now();
  try {
    const res = await input.fetch(url, { ...init, signal: controller.signal });
    result.latencyMs = Math.max(0, Math.round(input.now() - started));
    result.httpStatus = res.status;
    if (id === "horizon" || id === "soroban_rpc") {
      try {
        result.networkPassphrase = passphraseFrom(id, await res.json());
      } catch {
        // A non-JSON body leaves the identity unknown; status still counts.
      }
      if (result.networkPassphrase !== null) {
        result.networkMatch = result.networkPassphrase === input.expectedNetworkPassphrase;
      }
    }
    if (!res.ok) {
      result.status = "degraded";
      result.error = `Answered HTTP ${res.status}.`;
      result.action =
        res.status >= 500 || res.status === 429
          ? `The ${UPSTREAM_NAMES[id]} is up but failing; retry later or check its status page.`
          : `Check ${UPSTREAM_ENV[id]} points at the right service and path.`;
    } else if (result.networkMatch === false) {
      result.status = "degraded";
      result.error = "Reports a different network than this server is configured for.";
      result.action = `Point ${UPSTREAM_ENV[id]} at a ${input.expectedNetworkPassphrase} endpoint, or change the configured network.`;
    } else {
      result.status = "ok";
    }
  } catch (err) {
    result.error = transportMessage(err, input.timeoutMs);
    result.action = `Check ${UPSTREAM_ENV[id]}, DNS and network or proxy settings.`;
  } finally {
    clearTimeout(timer);
  }
  return result;
}

function verdictOf(results: UpstreamProbeResult[]): UpstreamVerdict {
  const probed = results.filter((r) => r.status !== "skipped");
  // The API, Horizon and Soroban RPC are required; without them the server
  // cannot browse, pay or read the registry.
  const required = probed.filter((r) => r.id !== "sponsored_account");
  if (required.some((r) => r.status === "down" || r.status === "not_configured"))
    return "unhealthy";
  if (probed.some((r) => r.status !== "ok" && r.status !== "not_configured")) return "degraded";
  return "healthy";
}

const SUMMARY: Record<UpstreamVerdict, string> = {
  healthy: "All probed upstreams are reachable and on the configured network.",
  degraded: "Some upstreams answered with errors or report a different network.",
  unhealthy: "A required upstream is unreachable or not configured.",
};

/** Probe the configured upstreams once each, in parallel. */
export async function probeUpstreams(input: UpstreamProbeInput): Promise<UpstreamProbeReport> {
  const timeoutMs = Math.min(
    Math.max(input.timeoutMs ?? UPSTREAM_PROBE_DEFAULT_TIMEOUT_MS, UPSTREAM_PROBE_MIN_TIMEOUT_MS),
    UPSTREAM_PROBE_MAX_TIMEOUT_MS,
  );
  const deps = {
    fetch: input.fetch,
    now: input.now ?? (() => performance.now()),
    timeoutMs,
    userAgent: input.userAgent ?? "mindvault-mcp",
    expectedNetworkPassphrase: input.expectedNetworkPassphrase,
  };
  const only = input.only && input.only.length > 0 ? new Set(input.only) : null;
  const upstreams = await Promise.all(
    UPSTREAM_IDS.map(async (id): Promise<UpstreamProbeResult> => {
      const base = input.urls[id]?.trim() || null;
      const blank = {
        id,
        name: UPSTREAM_NAMES[id],
        url: base ? displayUrl(base) : null,
        httpStatus: null,
        latencyMs: null,
        networkPassphrase: null,
        networkMatch: null,
        error: null,
        action: null,
      };
      if (only && !only.has(id)) return { ...blank, status: "skipped" };
      if (!base) {
        return {
          ...blank,
          status: "not_configured",
          action: `Set ${UPSTREAM_ENV[id]} to enable this upstream.`,
        };
      }
      return probeOne(id, base, deps);
    }),
  );
  const counts: Record<UpstreamStatus, number> = {
    ok: 0,
    degraded: 0,
    down: 0,
    not_configured: 0,
    skipped: 0,
  };
  for (const u of upstreams) counts[u.status]++;
  const verdict = verdictOf(upstreams);
  return {
    profile: input.profile,
    expectedNetworkPassphrase: input.expectedNetworkPassphrase,
    timeoutMs,
    verdict,
    counts,
    upstreams,
    summary: SUMMARY[verdict],
  };
}

/** Human-readable rendering of a probe report. */
export function formatUpstreamProbe(report: UpstreamProbeReport): string {
  const icon: Record<UpstreamStatus, string> = {
    ok: "✓",
    degraded: "!",
    down: "✗",
    not_configured: "-",
    skipped: "·",
  };
  const lines = [
    `Verdict: ${report.verdict} — ${report.summary}`,
    `Profile: ${report.profile} · expected network: ${report.expectedNetworkPassphrase}`,
    "",
  ];
  for (const u of report.upstreams) {
    const bits = [
      u.status,
      u.httpStatus !== null ? `HTTP ${u.httpStatus}` : null,
      u.latencyMs !== null ? `${u.latencyMs}ms` : null,
      u.networkMatch === null
        ? null
        : u.networkMatch
          ? "network ok"
          : `network: ${u.networkPassphrase}`,
    ].filter(Boolean);
    lines.push(`${icon[u.status]} ${u.name}${u.url ? ` (${u.url})` : ""}: ${bits.join(", ")}`);
    if (u.error) lines.push(`    ${u.error}`);
    if (u.action) lines.push(`    → ${u.action}`);
  }
  return lines.join("\n");
}
