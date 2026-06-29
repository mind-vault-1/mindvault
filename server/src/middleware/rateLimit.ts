import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getLogger } from "../lib/logger.js";
import type { RateLimitStore } from "../lib/rateLimit/index.js";
import { parsePayerFromXPayment } from "../lib/parseXPayment.js";
import { rateLimitCounter } from "../lib/metrics.js";

export const RATE_LIMITED = "RATE_LIMITED";

function rateLimitHandler(req: Request, res: Response, _next: () => void, options: Options): void {
  const limiter = (req as Request & { rateLimitName?: string }).rateLimitName ?? "default";
  rateLimitCounter.inc({ limiter });
  const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
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

type LimitedRequest = Request & { rateLimitName?: string };

export function createIpRateLimiter(max: number, windowMs: number, name = "ip") {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientIp,
    handler(req, res, next, options) {
      (req as LimitedRequest).rateLimitName = name;
      rateLimitHandler(req as LimitedRequest, res, next, options);
    },
  });
}

export function createWalletRateLimiter(
  store: RateLimitStore,
  namespace: string,
  max: number,
  windowMs: number,
  getWallet: (req: Request) => string | undefined,
  name = "wallet",
) {
  return rateLimit({
    windowMs,
    max,
    windowMs,
    skip: (req) => !getWallet(req),
    keyGenerator: (req) => `wallet:${getWallet(req)}`,
    handler(req, res, next, options) {
      (req as LimitedRequest).rateLimitName = name;
      rateLimitHandler(req as LimitedRequest, res, next, options);
    },
  });
}

export function extractPayerFromPaymentHeader(req: Request): string | undefined {
  const header = req.headers["x-payment"];
  if (!header || typeof header !== "string") {
    return undefined;
  }
  return parsePayerFromXPayment(header).payer;
}
