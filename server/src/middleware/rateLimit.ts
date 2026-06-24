import rateLimit, { type Options } from "express-rate-limit";
import type { Request, Response } from "express";
import { parsePayerFromXPayment } from "../lib/parseXPayment.js";

export const RATE_LIMITED = "RATE_LIMITED";

function rateLimitHandler(_req: Request, res: Response, _next: () => void, options: Options): void {
  const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(429).json({
    error: "Too many requests",
    code: RATE_LIMITED,
    retryAfterSeconds,
  });
}

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function createIpRateLimiter(max: number, windowMs: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientIp,
    handler: rateLimitHandler,
  });
}

export function createWalletRateLimiter(
  max: number,
  windowMs: number,
  getWallet: (req: Request) => string | undefined,
) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !getWallet(req),
    keyGenerator: (req) => `wallet:${getWallet(req)}`,
    handler: rateLimitHandler,
  });
}

export function extractPayerFromPaymentHeader(req: Request): string | undefined {
  const header = req.headers["x-payment"];
  if (!header || typeof header !== "string") {
    return undefined;
  }
  return parsePayerFromXPayment(header).payer;
}
