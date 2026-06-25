import {
  createIpRateLimiter,
  createWalletRateLimiter,
  extractPayerFromPaymentHeader,
} from "../middleware/rateLimit.js";
import { config } from "../config.js";

export const verifyIpRateLimit = createIpRateLimiter(
  config.RATE_LIMIT_VERIFY_IP_MAX,
  config.RATE_LIMIT_VERIFY_IP_WINDOW_MS,
);

export const verifyWalletRateLimit = createWalletRateLimiter(
  config.RATE_LIMIT_VERIFY_WALLET_MAX,
  config.RATE_LIMIT_VERIFY_WALLET_WINDOW_MS,
  extractPayerFromPaymentHeader,
);

export const publishIpRateLimit = createIpRateLimiter(
  config.RATE_LIMIT_PUBLISH_IP_MAX,
  config.RATE_LIMIT_PUBLISH_IP_WINDOW_MS,
);

export const publishWalletRateLimit = createWalletRateLimiter(
  config.RATE_LIMIT_PUBLISH_WALLET_MAX,
  config.RATE_LIMIT_PUBLISH_WALLET_WINDOW_MS,
  (req) => req.publisher?.walletAddress,
);
