import {
  createIpRateLimiter,
  createWalletRateLimiter,
  extractPayerFromPaymentHeader,
} from "../middleware/rateLimit.js";
import { config } from "../config.js";
import { getRateLimitStore } from "../lib/rateLimit/index.js";
import type { RequestHandler } from "express";

const store = getRateLimitStore();

export const verifyIpRateLimit: RequestHandler = createIpRateLimiter(
  store,
  "verify",
  config.RATE_LIMIT_VERIFY_IP_MAX,
  config.RATE_LIMIT_VERIFY_IP_WINDOW_MS,
);

export const verifyWalletRateLimit: RequestHandler = createWalletRateLimiter(
  store,
  "verify",
  config.RATE_LIMIT_VERIFY_WALLET_MAX,
  config.RATE_LIMIT_VERIFY_WALLET_WINDOW_MS,
  extractPayerFromPaymentHeader,
);

export const publishIpRateLimit: RequestHandler = createIpRateLimiter(
  store,
  "publish",
  config.RATE_LIMIT_PUBLISH_IP_MAX,
  config.RATE_LIMIT_PUBLISH_IP_WINDOW_MS,
);

export const publishWalletRateLimit: RequestHandler = createWalletRateLimiter(
  store,
  "publish",
  config.RATE_LIMIT_PUBLISH_WALLET_MAX,
  config.RATE_LIMIT_PUBLISH_WALLET_WINDOW_MS,
  (req) => req.publisher?.walletAddress,
);
