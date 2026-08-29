/**
 * Request timeout controls for MindVault MCP outbound HTTP.
 *
 * Every outbound call the MCP server makes — the MindVault API, Horizon, Soroban
 * RPC, the sponsored-account service, and x402 paid fetches — previously had no
 * deadline. A hung or black-holed connection left the tool call blocked forever,
 * which for a stdio MCP server means the agent waits indefinitely with no error
 * to react to.
 *
 * Each call now runs under an AbortController whose timer fires after a
 * per-service budget. Budgets differ because the work differs: a catalog read
 * should be quick, while an x402 payment includes on-chain settlement and is
 * legitimately slow. All four are configurable by environment variable, and
 * setting one to 0 disables the deadline for that service.
 *
 * This module is pure and injectable (fetch, timer callbacks) so the behaviour
 * is unit-testable without real waiting.
 */

// ── User-Agent ────────────────────────────────────────────────────────────────

/**
 * Environment variable that overrides the `User-Agent` header sent on every
 * outbound HTTP request from the MCP server.
 *
 * The default value is `mindvault-mcp/1.0.0`. Set this variable when you want
 * to identify the specific agent or deployment making requests — useful for
 * distinguishing traffic in server logs or rate-limit buckets.
 *
 * @example MINDVAULT_USER_AGENT=my-bot/2.0 (mindvault-mcp)
 */
export const USER_AGENT_ENV_VAR = "MINDVAULT_USER_AGENT";

/** The fallback sent when `MINDVAULT_USER_AGENT` is not set. */
export const DEFAULT_USER_AGENT = "mindvault-mcp/1.0.0";

/**
 * Resolve the `User-Agent` string from the environment.
 *
 * Returns the value of `MINDVAULT_USER_AGENT` when it is set to a non-empty
 * string, otherwise falls back to `DEFAULT_USER_AGENT`. Whitespace-only values
 * are treated as unset.
 */
export function resolveUserAgent(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[USER_AGENT_ENV_VAR];
  return raw && raw.trim() ? raw.trim() : DEFAULT_USER_AGENT;
}

// ── Timeouts ──────────────────────────────────────────────────────────────────

/** Services with independently tunable deadlines. */
export type TimeoutService = "http" | "horizon" | "soroban" | "payment";

export type TimeoutBudgets = Record<TimeoutService, number>;

/**
 * Default deadlines in milliseconds.
 *
 * - `http` (15s) — MindVault API and the sponsored-account service.
 * - `horizon` (15s) — Horizon account/balance reads.
 * - `soroban` (20s) — Soroban RPC; simulation can be slower than a REST read.
 * - `payment` (45s) — x402 paid fetches, which include on-chain settlement.
 */
export const DEFAULT_TIMEOUTS: TimeoutBudgets = {
  http: 15_000,
  horizon: 15_000,
  soroban: 20_000,
  payment: 45_000,
};

/** Environment variable that overrides each service budget. */
export const TIMEOUT_ENV_VARS: Record<TimeoutService, string> = {
  http: "MINDVAULT_HTTP_TIMEOUT_MS",
  horizon: "MINDVAULT_HORIZON_TIMEOUT_MS",
  soroban: "MINDVAULT_SOROBAN_TIMEOUT_MS",
  payment: "MINDVAULT_PAYMENT_TIMEOUT_MS",
};

/** Raised when a request exceeds its budget. Mapped to the `timeout` category. */
export class RequestTimeoutError extends Error {
  readonly name = "TimeoutError";
  readonly timeoutMs: number;
  readonly service: TimeoutService;

  constructor(service: TimeoutService, timeoutMs: number) {
    super(
      `Request timed out after ${timeoutMs}ms (${service}). ` +
        `Raise ${TIMEOUT_ENV_VARS[service]} if this endpoint is legitimately slow.`,
    );
    this.service = service;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Parse one budget from the environment.
 *
 * A non-numeric or negative value falls back to the default rather than failing
 * startup — a typo must not brick the server. `0` is meaningful and kept: it
 * disables the deadline for that service.
 */
function parseBudget(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

/** Resolve all four budgets from the environment, falling back to defaults. */
export function resolveTimeouts(env: NodeJS.ProcessEnv = process.env): TimeoutBudgets {
  return {
    http: parseBudget(env[TIMEOUT_ENV_VARS.http], DEFAULT_TIMEOUTS.http),
    horizon: parseBudget(env[TIMEOUT_ENV_VARS.horizon], DEFAULT_TIMEOUTS.horizon),
    soroban: parseBudget(env[TIMEOUT_ENV_VARS.soroban], DEFAULT_TIMEOUTS.soroban),
    payment: parseBudget(env[TIMEOUT_ENV_VARS.payment], DEFAULT_TIMEOUTS.payment),
  };
}

/** A budget of 0 (or less) means "no deadline". */
export function isTimeoutDisabled(timeoutMs: number): boolean {
  return !Number.isFinite(timeoutMs) || timeoutMs <= 0;
}

/**
 * Run a fetch under a deadline.
 *
 * The controller aborts the in-flight request when the timer fires, so the
 * socket is released rather than left hanging, and the caller sees a
 * `RequestTimeoutError` instead of an ambiguous `AbortError`. Any signal the
 * caller already supplied is honoured too: aborting either one aborts the
 * request.
 */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  service: TimeoutService,
  timeoutMs: number,
): Promise<Response> {
  if (isTimeoutDisabled(timeoutMs)) return fetchImpl(input, init);

  const controller = new AbortController();
  const callerSignal = init?.signal ?? undefined;

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  // Never hold the event loop open just for a pending timeout.
  timer.unref?.();

  const forwardAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", forwardAbort, { once: true });
  }

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (err) {
    // Distinguish "we ran out of budget" from "the caller cancelled us".
    if (timedOut) throw new RequestTimeoutError(service, timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Wrap a fetch implementation so every call it makes carries a fixed budget.
 * Used to give the x402 paid fetch a deadline without changing its call sites.
 */
export function withTimeout(
  fetchImpl: typeof fetch,
  service: TimeoutService,
  timeoutMs: number,
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    fetchWithTimeout(fetchImpl, input, init, service, timeoutMs)) as typeof fetch;
}

/** Compact, operator-facing summary of the active budgets. */
export function describeTimeouts(budgets: TimeoutBudgets): string {
  const render = (service: TimeoutService) =>
    `${service}=${isTimeoutDisabled(budgets[service]) ? "disabled" : `${budgets[service]}ms`}`;
  return (["http", "horizon", "soroban", "payment"] as TimeoutService[]).map(render).join(", ");
}
