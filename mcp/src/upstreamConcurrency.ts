import type { rpc } from "@stellar/stellar-sdk";
import type { ExactStellarScheme } from "@x402/stellar/exact/client";

export const UPSTREAM_CONCURRENCY_ENV = "MINDVAULT_MAX_CONCURRENT_UPSTREAM_REQUESTS";
export const DEFAULT_UPSTREAM_CONCURRENCY = 8;

export function upstreamConcurrencyFromEnv(env: NodeJS.ProcessEnv): number {
  const raw = env[UPSTREAM_CONCURRENCY_ENV]?.trim() ?? String(DEFAULT_UPSTREAM_CONCURRENCY);
  const limit = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(limit) || limit < 1) {
    throw new Error(`${UPSTREAM_CONCURRENCY_ENV} must be a positive integer.`);
  }
  return limit;
}

export function createUpstreamLimiter(limit: number) {
  let active = 0;
  const waiting = new Set<() => void>();

  return async function run<T>(request: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (active < limit) {
      active++;
    } else {
      await new Promise<void>((resolve, reject) => {
        const start = () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          waiting.delete(start);
          reject(signal?.reason);
        };
        waiting.add(start);
        signal?.addEventListener("abort", abort, { once: true });
      });
    }

    try {
      signal?.throwIfAborted();
      return await request();
    } finally {
      const next = waiting.values().next().value;
      if (next) {
        waiting.delete(next);
        next();
      } else {
        active--;
      }
    }
  };
}

let runUpstream: ReturnType<typeof createUpstreamLimiter> | undefined;

export function withUpstreamSlot<T>(request: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  runUpstream ??= createUpstreamLimiter(upstreamConcurrencyFromEnv(process.env));
  return runUpstream(request, signal);
}

export function limitUpstreamFetch(fetchImpl: typeof fetch): typeof fetch {
  return (input, init) => {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    return withUpstreamSlot(() => fetchImpl(input, init), signal);
  };
}

export function limitRpcServer(server: rpc.Server): rpc.Server {
  // Wrapping the SDK transport releases the slot between polls or assembly steps.
  const client = server.httpClient;
  const post: typeof client.post = client.post.bind(client);
  client.post = <T>(url: string, data?: unknown, config?: Parameters<typeof post>[2]) =>
    withUpstreamSlot(() => post<T>(url, data, config));
  return server;
}

export function limitPaymentPayload(scheme: ExactStellarScheme): ExactStellarScheme {
  // x402 owns the RPC instances used by its sequential payment simulation.
  const createPayload = scheme.createPaymentPayload;
  scheme.createPaymentPayload = (...args) =>
    withUpstreamSlot(() => createPayload.apply(scheme, args));
  return scheme;
}
