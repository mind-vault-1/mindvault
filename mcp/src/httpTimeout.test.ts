/**
 * Unit tests for request timeout controls (#408).
 *
 * Uses fake timers to simulate a slow fetch without real waiting, so the suite
 * stays fast while still exercising the AbortController path end to end.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DEFAULT_TIMEOUTS,
  DEFAULT_USER_AGENT,
  RequestTimeoutError,
  TIMEOUT_ENV_VARS,
  USER_AGENT_ENV_VAR,
  describeTimeouts,
  fetchWithTimeout,
  isTimeoutDisabled,
  resolveTimeouts,
  resolveUserAgent,
  withTimeout,
} from "./httpTimeout.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A fetch that never settles until its request is aborted. */
function hangingFetch(): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return; // hangs forever
      if (signal.aborted) {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
        return;
      }
      signal.addEventListener("abort", () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
    })) as typeof fetch;
}

function okResponse(): Response {
  return { ok: true, status: 200, headers: new Headers() } as Response;
}

describe("resolveTimeouts", () => {
  it("uses the documented defaults when nothing is set", () => {
    expect(resolveTimeouts({})).toEqual(DEFAULT_TIMEOUTS);
    expect(DEFAULT_TIMEOUTS.http).toBe(15_000);
    expect(DEFAULT_TIMEOUTS.horizon).toBe(15_000);
    expect(DEFAULT_TIMEOUTS.soroban).toBe(20_000);
    expect(DEFAULT_TIMEOUTS.payment).toBe(45_000);
  });

  it("gives payments a longer budget than plain reads", () => {
    expect(DEFAULT_TIMEOUTS.payment).toBeGreaterThan(DEFAULT_TIMEOUTS.http);
  });

  it("honours each documented environment override independently", () => {
    const budgets = resolveTimeouts({
      [TIMEOUT_ENV_VARS.http]: "1000",
      [TIMEOUT_ENV_VARS.horizon]: "2000",
      [TIMEOUT_ENV_VARS.soroban]: "3000",
      [TIMEOUT_ENV_VARS.payment]: "4000",
    });
    expect(budgets).toEqual({ http: 1000, horizon: 2000, soroban: 3000, payment: 4000 });
  });

  it("treats 0 as an explicit opt-out rather than a fallback", () => {
    expect(resolveTimeouts({ [TIMEOUT_ENV_VARS.http]: "0" }).http).toBe(0);
    expect(isTimeoutDisabled(0)).toBe(true);
  });

  it("falls back to the default on garbage rather than failing startup", () => {
    expect(resolveTimeouts({ [TIMEOUT_ENV_VARS.http]: "abc" }).http).toBe(DEFAULT_TIMEOUTS.http);
    expect(resolveTimeouts({ [TIMEOUT_ENV_VARS.http]: "-5" }).http).toBe(DEFAULT_TIMEOUTS.http);
    expect(resolveTimeouts({ [TIMEOUT_ENV_VARS.http]: "" }).http).toBe(DEFAULT_TIMEOUTS.http);
  });

  it("floors fractional values", () => {
    expect(resolveTimeouts({ [TIMEOUT_ENV_VARS.soroban]: "1500.9" }).soroban).toBe(1500);
  });
});

describe("fetchWithTimeout — slow fetch", () => {
  it("aborts and raises a TimeoutError once the budget elapses", async () => {
    vi.useFakeTimers();
    const promise = fetchWithTimeout(hangingFetch(), "https://example.test", {}, "http", 5_000);
    const assertion = expect(promise).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it("names the budget and the variable that raises it", async () => {
    vi.useFakeTimers();
    const promise = fetchWithTimeout(hangingFetch(), "https://example.test", {}, "soroban", 1_234);
    const assertion = expect(promise).rejects.toThrow(
      /Request timed out after 1234ms \(soroban\).*MINDVAULT_SOROBAN_TIMEOUT_MS/s,
    );

    await vi.advanceTimersByTimeAsync(1_234);
    await assertion;
  });

  it("reports a name the error mapper classifies as a timeout", async () => {
    vi.useFakeTimers();
    const promise = fetchWithTimeout(hangingFetch(), "https://example.test", {}, "http", 100);
    const assertion = promise.catch((e) => e);

    await vi.advanceTimersByTimeAsync(100);
    const err = await assertion;
    expect(err.name).toBe("TimeoutError");
    expect(err.service).toBe("http");
    expect(err.timeoutMs).toBe(100);
  });

  it("passes an AbortSignal to fetch so the socket is actually released", async () => {
    const spy = vi.fn().mockResolvedValue(okResponse());
    await fetchWithTimeout(
      spy as unknown as typeof fetch,
      "https://example.test",
      {},
      "http",
      5000,
    );

    const init = spy.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(false);
  });
});

describe("fetchWithTimeout — normal operation", () => {
  it("returns the response untouched when it beats the deadline", async () => {
    const response = okResponse();
    const fast = vi.fn().mockResolvedValue(response);
    await expect(
      fetchWithTimeout(fast as unknown as typeof fetch, "https://example.test", {}, "http", 5000),
    ).resolves.toBe(response);
  });

  it("preserves the caller's init options", async () => {
    const spy = vi.fn().mockResolvedValue(okResponse());
    await fetchWithTimeout(
      spy as unknown as typeof fetch,
      "https://example.test",
      { method: "POST", body: "{}", headers: { "x-test": "1" } },
      "http",
      5000,
    );

    const init = spy.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.headers).toEqual({ "x-test": "1" });
  });

  it("skips the controller entirely when the budget is disabled", async () => {
    const spy = vi.fn().mockResolvedValue(okResponse());
    await fetchWithTimeout(spy as unknown as typeof fetch, "https://example.test", {}, "http", 0);
    expect(spy.mock.calls[0][1]?.signal).toBeUndefined();
  });

  it("does not disguise a non-timeout failure as a timeout", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      fetchWithTimeout(failing as unknown as typeof fetch, "https://x.test", {}, "http", 5000),
    ).rejects.toThrow("ECONNREFUSED");
  });

  it("honours a signal the caller already supplied", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchWithTimeout(
        hangingFetch(),
        "https://example.test",
        { signal: controller.signal },
        "http",
        60_000,
      ),
    ).rejects.toThrow(/aborted/i);
  });
});

describe("withTimeout", () => {
  it("applies the budget to every call through the wrapped fetch", async () => {
    vi.useFakeTimers();
    const wrapped = withTimeout(hangingFetch(), "payment", 2_000);
    const promise = wrapped("https://example.test");
    const assertion = expect(promise).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
  });
});

describe("describeTimeouts", () => {
  it("renders every budget for operator output", () => {
    expect(describeTimeouts(DEFAULT_TIMEOUTS)).toBe(
      "http=15000ms, horizon=15000ms, soroban=20000ms, payment=45000ms",
    );
  });

  it("shows a disabled budget explicitly", () => {
    expect(describeTimeouts({ ...DEFAULT_TIMEOUTS, http: 0 })).toContain("http=disabled");
  });
});

describe("resolveUserAgent", () => {
  it("returns the default when MINDVAULT_USER_AGENT is not set", () => {
    expect(resolveUserAgent({})).toBe(DEFAULT_USER_AGENT);
    expect(DEFAULT_USER_AGENT).toBe("mindvault-mcp/1.0.0");
  });

  it("documents the correct env var name", () => {
    expect(USER_AGENT_ENV_VAR).toBe("MINDVAULT_USER_AGENT");
  });

  it("returns a custom value when the env var is set", () => {
    expect(resolveUserAgent({ [USER_AGENT_ENV_VAR]: "my-bot/2.0" })).toBe("my-bot/2.0");
  });

  it("trims surrounding whitespace from the custom value", () => {
    expect(resolveUserAgent({ [USER_AGENT_ENV_VAR]: "  my-bot/2.0  " })).toBe("my-bot/2.0");
  });

  it("falls back to the default when the value is whitespace-only", () => {
    expect(resolveUserAgent({ [USER_AGENT_ENV_VAR]: "   " })).toBe(DEFAULT_USER_AGENT);
  });

  it("falls back to the default when the value is an empty string", () => {
    expect(resolveUserAgent({ [USER_AGENT_ENV_VAR]: "" })).toBe(DEFAULT_USER_AGENT);
  });

  it("preserves values that include parenthetical comments", () => {
    const ua = "my-agent/1.0 (mindvault-mcp)";
    expect(resolveUserAgent({ [USER_AGENT_ENV_VAR]: ua })).toBe(ua);
  });
});
