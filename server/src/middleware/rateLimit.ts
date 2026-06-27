import rateLimit, { type Options } from "express-rate-limit";
import type { Request, Response } from "express";
import { parsePayerFromXPayment } from "../lib/parseXPayment.js";

export const RATE_LIMITED = "RATE_LIMITED";

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function sendRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  resetAt: number,
): void {
  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
}

function sendTooManyRequests(res: Response, retryAfterSeconds: number): void {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(429).json({
    error: "Too many requests",
    code: RATE_LIMITED,
    retryAfterSeconds,
  });
}

export interface RateLimiterOptions {
  store: RateLimitStore;
  max: number;
  windowMs: number;
  keyGenerator: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const { store, max, windowMs, keyGenerator, skip } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (skip?.(req)) {
      next();
      return;
    }

    const key = keyGenerator(req);

    try {
      const result = await store.consume(key, max, windowMs);
      sendRateLimitHeaders(res, result.limit, result.remaining, result.resetAt);

      if (!result.allowed) {
        sendTooManyRequests(res, result.retryAfterSeconds ?? Math.ceil(windowMs / 1000));
        return;
      }

      next();
    } catch (err) {
      // Fail open when the shared store is unavailable so traffic isn't blocked entirely.
      getLogger().warn({ event: "rate_limit_store_error", err, key }, "rate limit store error");
      next();
    }
  };
}

export function createIpRateLimiter(
  store: RateLimitStore,
  namespace: string,
  max: number,
  windowMs: number,
): RequestHandler {
  return createRateLimiter({
    store,
    max,
    windowMs,
    keyGenerator: (req) => `${namespace}:ip:${clientIp(req)}`,
  });
}

export function createWalletRateLimiter(
  store: RateLimitStore,
  namespace: string,
  max: number,
  windowMs: number,
  getWallet: (req: Request) => string | undefined,
): RequestHandler {
  return createRateLimiter({
    store,
    max,
    windowMs,
    skip: (req) => !getWallet(req),
    keyGenerator: (req) => `${namespace}:wallet:${getWallet(req)}`,
  });
}

export function extractPayerFromPaymentHeader(req: Request): string | undefined {
  const header = req.headers["x-payment"];
  if (!header || typeof header !== "string") {
    return undefined;
  }
  return parsePayerFromXPayment(header).payer;
}
