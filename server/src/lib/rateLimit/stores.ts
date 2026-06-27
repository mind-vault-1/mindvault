import { randomBytes } from "node:crypto";
import type { RateLimitConsumeResult, RateLimitStore } from "./types.js";

function buildBlockedResult(
  limit: number,
  count: number,
  oldestTimestamp: number,
  windowMs: number,
  now: number,
): RateLimitConsumeResult {
  const resetAt = oldestTimestamp + windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
  return {
    allowed: false,
    limit,
    remaining: 0,
    resetAt,
    retryAfterSeconds,
  };
}

function buildAllowedResult(limit: number, count: number, now: number, windowMs: number): RateLimitConsumeResult {
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: now + windowMs,
  };
}

/**
 * In-process sliding-window log. Each accepted request records a timestamp;
 * only events within the last `windowMs` count toward the limit.
 */
export class MemorySlidingWindowStore implements RateLimitStore {
  private readonly entries = new Map<string, number[]>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitConsumeResult> {
    const now = this.now();
    const windowStart = now - windowMs;
    const active = (this.entries.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (active.length >= limit) {
      this.entries.set(key, active);
      return buildBlockedResult(limit, active.length, active[0]!, windowMs, now);
    }

    active.push(now);
    this.entries.set(key, active);
    return buildAllowedResult(limit, active.length, now, windowMs);
  }

  /** Test helper — clear all counters. */
  clear(): void {
    this.entries.clear();
  }
}

/**
 * Redis-backed sliding-window log using a sorted set per key.
 * Safe for horizontally scaled deployments when REDIS_URL is configured.
 */
export class RedisSlidingWindowStore implements RateLimitStore {
  private client: import("redis").RedisClientType | null = null;
  private readonly connectPromise: Promise<void>;

  constructor(private readonly redisUrl: string) {
    this.connectPromise = this.init();
  }

  private async init(): Promise<void> {
    const { createClient } = await import("redis");
    this.client = createClient({ url: this.redisUrl });
    this.client.on("error", () => {
      // Connection errors are handled per consume call; avoid crashing the process.
    });
    await this.client.connect();
  }

  private consumeScript = `
    local window_start = tonumber(ARGV[1]) - tonumber(ARGV[2])
    redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, window_start)
    local current = redis.call('ZCARD', KEYS[1])
    if current >= tonumber(ARGV[3]) then
      local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
      local reset_at = tonumber(oldest[2]) + tonumber(ARGV[2])
      return {0, current, reset_at}
    end
    redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
    redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
    return {1, tonumber(ARGV[3]) - current - 1, tonumber(ARGV[1]) + tonumber(ARGV[2])}
  `;

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitConsumeResult> {
    await this.connectPromise;
    if (!this.client?.isOpen) {
      throw new Error("Redis rate-limit client is not connected");
    }

    const now = Date.now();
    const member = `${now}:${randomBytes(8).toString("hex")}`;
    const result = (await this.client.eval(this.consumeScript, {
      keys: [key],
      arguments: [String(now), String(windowMs), String(limit), member],
    })) as [number, number, number];

    const [allowedFlag, secondValue, resetAt] = result;
    if (allowedFlag === 1) {
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, secondValue),
        resetAt,
      };
    }

    const count = secondValue;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      retryAfterSeconds,
    };
  }

  async close(): Promise<void> {
    await this.connectPromise;
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }
}
