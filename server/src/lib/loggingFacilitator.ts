import { HTTPFacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { getLogger } from "./logger.js";

function summarizeVerify(result: VerifyResponse): Record<string, unknown> {
  const r = result as VerifyResponse & {
    isValid?: boolean;
    valid?: boolean;
    invalidReason?: string;
    error?: string;
  };
  return {
    isValid: r.isValid ?? r.valid,
    invalidReason: r.invalidReason,
    error: r.error,
  };
}

function summarizeSettle(result: SettleResponse): Record<string, unknown> {
  const r = result as SettleResponse & {
    success?: boolean;
    error?: string;
    transaction?: string;
    txHash?: string;
  };
  return {
    success: r.success,
    error: r.error,
    transaction: r.transaction,
    txHash: r.txHash,
  };
}

/**
 * HTTPFacilitatorClient wrapper that logs verify/settle outcomes with the active request id.
 */
export function createLoggingFacilitatorClient(url: string): HTTPFacilitatorClient {
  const inner = new HTTPFacilitatorClient({ url });

  return {
    url: inner.url,
    getSupported: (...args: Parameters<HTTPFacilitatorClient["getSupported"]>) =>
      inner.getSupported(...args),
    async verify(
      paymentPayload: PaymentPayload,
      paymentRequirements: PaymentRequirements,
    ): Promise<VerifyResponse> {
      const log = getLogger();
      const network = paymentRequirements.network;
      log.info({ event: "x402_verify", phase: "start", network }, "x402 verify");
      try {
        const result = await inner.verify(paymentPayload, paymentRequirements);
        log.info(
          { event: "x402_verify", phase: "complete", network, ...summarizeVerify(result) },
          "x402 verify",
        );
        return result;
      } catch (err) {
        log.error({ event: "x402_verify", phase: "error", network, err }, "x402 verify failed");
        throw err;
      }
    },
    async settle(
      paymentPayload: PaymentPayload,
      paymentRequirements: PaymentRequirements,
    ): Promise<SettleResponse> {
      const log = getLogger();
      const network = paymentRequirements.network;
      log.info({ event: "x402_settle", phase: "start", network }, "x402 settle");
      try {
        const result = await inner.settle(paymentPayload, paymentRequirements);
        log.info(
          { event: "x402_settle", phase: "complete", network, ...summarizeSettle(result) },
          "x402 settle",
        );
        return result;
      } catch (err) {
        log.error({ event: "x402_settle", phase: "error", network, err }, "x402 settle failed");
        throw err;
      }
    },
  } as HTTPFacilitatorClient;
}
