/**
 * Per-origin rate-limit coordination for parallel MCP calls (#1069).
 *
 * A single MCP server can have several tool calls in flight at once — a batch
 * publish, a fan-out of catalog lookups, an agent polling while it buys — and
 * they all talk to the same handful of origins. When one of them is told to
 * slow down (`429 Too Many Requests` with a `Retry-After`), the others have no
 * way to know, so each retries on its own schedule and the server's rate-limit
 * window is hit again by every caller at once.
 *
 * This module keeps one shared "not before" deadline per origin. A call that
 * sees a 429 records the delay it was given ({@link RateLimitCoordinator.noteRateLimit})
 * and every call for that origin awaits it before its next attempt
 * ({@link RateLimitCoordinator.acquire}). Origins are independent: a backoff on
 * `api.example.com` never blocks a call to `horizon.stellar.org`.
 *
 * Two properties keep coordination safe:
 *
 *  - **Bounded.** A recorded delay is clamped to `maxDelayMs`, so a hostile or
 *    mistaken `Retry-After` cannot park every call for an unbounded time.
 *  - **Cancellable.** `acquire` takes an `AbortSignal` and rejects promptly
 *    when the caller cancels, so a wait never outlives the tool call.
 *
 * The module is pure and injectable (`now`, `sleep`) so shared backoff is
 * unit-testable without real waiting.
 */

/** Default ceiling on a shared per-origin backoff (milliseconds). */
export const DEFAULT_RATE_LIMIT_MAX_DELAY_MS = 60_000;

/** Upper bound on sleep rounds in one `acquire`, so a stuck clock cannot loop forever. */
const MAX_ACQUIRE_ROUNDS = 64;

/** The origin (scheme + host + port) of a URL, or null when it is not a URL. */
export function requestOrigin(input: string | URL): string | null {
  try {
    const url = input instanceof URL ? input : new URL(input);
    return url.origin || null;
  } catch {
    return null;
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

/** A sleep that resolves after `ms`, or rejects with an `AbortError` if `signal` aborts. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    timer.unref?.();

    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface RateLimitCoordinatorOptions {
  /** Ceiling applied to any recorded backoff. Defaults to 60s. */
  maxDelayMs?: number;
  /** Injectable clock. */
  now?: () => number;
  /** Injectable sleep, used by `acquire`. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface RateLimitAcquireOptions {
  /** Rejects the wait with an `AbortError` when this signal aborts. */
  signal?: AbortSignal;
}

/**
 * Tracks a shared backoff deadline per API origin.
 *
 * Stateless with respect to HTTP: it only knows about origins and milliseconds,
 * so it is trivial to unit-test and safe to share process-wide.
 */
export class RateLimitCoordinator {
  private readonly waits = new Map<string, number>();
  private readonly maxDelayMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(options: RateLimitCoordinatorOptions = {}) {
    this.maxDelayMs = Math.max(0, options.maxDelayMs ?? DEFAULT_RATE_LIMIT_MAX_DELAY_MS);
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? abortableSleep;
  }

  /** The epoch-ms deadline an origin is held back until, or 0 when unthrottled. */
  backoffUntil(input: string | URL): number {
    const origin = requestOrigin(input);
    if (!origin) return 0;
    return this.waits.get(origin) ?? 0;
  }

  /** Milliseconds an origin is still held back, or 0. */
  remainingMs(input: string | URL): number {
    return Math.max(0, this.backoffUntil(input) - this.now());
  }

  /**
   * Record that an origin asked us to slow down.
   *
   * `delayMs` is the delay from `Retry-After` (see `retryAfterDelay`), clamped
   * to `maxDelayMs` so a hostile or mistaken header cannot park every call
   * forever. A null/undefined delay records nothing: without server guidance
   * the caller's own bounded backoff applies, and inventing a shared wait would
   * hold back unrelated parallel calls for no reason. The deadline only ever
   * moves forward, so two concurrent 429s do not shorten each other's wait.
   *
   * Returns the remaining backoff in milliseconds after recording.
   */
  noteRateLimit(input: string | URL, delayMs?: number | null): number {
    const origin = requestOrigin(input);
    if (!origin) return 0;
    if (delayMs == null) return this.remainingMs(input);

    const bounded = Math.max(0, Math.min(delayMs, this.maxDelayMs));
    const until = this.now() + bounded;

    const current = this.waits.get(origin) ?? 0;
    if (until > current) this.waits.set(origin, until);

    return this.remainingMs(input);
  }

  /**
   * Wait until an origin's shared backoff has elapsed.
   *
   * Resolves immediately when the origin is not throttled. Re-checks after each
   * sleep because a concurrent call may extend the deadline while we wait — so
   * the returned promise does not resolve into a window another call has just
   * been told to avoid. Rejects with an `AbortError` when `signal` aborts.
   */
  async acquire(input: string | URL, options: RateLimitAcquireOptions = {}): Promise<void> {
    const { signal } = options;
    for (let round = 0; round < MAX_ACQUIRE_ROUNDS; round++) {
      if (signal?.aborted) throw abortError();
      const remaining = this.remainingMs(input);
      if (remaining <= 0) return;
      await this.sleep(remaining, signal);
    }
    throw new Error(
      `Rate-limit wait for ${requestOrigin(input) ?? "origin"} did not settle after ${MAX_ACQUIRE_ROUNDS} rounds.`,
    );
  }

  /** Drop the recorded backoff for one origin, or for every origin. */
  clear(input?: string | URL): void {
    if (input === undefined) {
      this.waits.clear();
      return;
    }
    const origin = requestOrigin(input);
    if (origin) this.waits.delete(origin);
  }
}

/** Convenience factory mirroring the rest of the MCP modules. */
export function createRateLimitCoordinator(
  options: RateLimitCoordinatorOptions = {},
): RateLimitCoordinator {
  return new RateLimitCoordinator(options);
}
