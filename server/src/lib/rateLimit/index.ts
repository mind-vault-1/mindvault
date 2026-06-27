import { config } from "../../config.js";
import { rootLogger } from "../logger.js";
import { MemorySlidingWindowStore, RedisSlidingWindowStore } from "./stores.js";
import type { RateLimitStore } from "./types.js";

let sharedStore: RateLimitStore | null = null;

export function createRateLimitStore(): RateLimitStore {
  if (config.REDIS_URL) {
    rootLogger.info({ event: "rate_limit_store", backend: "redis" }, "using Redis rate-limit store");
    return new RedisSlidingWindowStore(config.REDIS_URL);
  }

  rootLogger.info({ event: "rate_limit_store", backend: "memory" }, "using in-memory rate-limit store");
  return new MemorySlidingWindowStore();
}

/** Shared store instance used by all limiters in this process. */
export function getRateLimitStore(): RateLimitStore {
  if (!sharedStore) {
    sharedStore = createRateLimitStore();
  }
  return sharedStore;
}

export async function closeRateLimitStore(): Promise<void> {
  if (sharedStore?.close) {
    await sharedStore.close();
  }
  sharedStore = null;
}

export type { RateLimitStore, RateLimitConsumeResult } from "./types.js";
export { MemorySlidingWindowStore, RedisSlidingWindowStore } from "./stores.js";
