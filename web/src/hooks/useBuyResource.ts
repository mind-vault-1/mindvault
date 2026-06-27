import { useCallback, useRef, useState } from "react";
import { checkNetwork } from "./useNetworkCheck.js";
import {
  expectedNetworkPassphrase,
  purchaseResource,
  PurchaseError,
  type PurchaseResult,
} from "../lib/x402Buy.js";

export type BuyStatus = "idle" | "paying" | "success" | "error";

export interface BuyState {
  status: BuyStatus;
  result: PurchaseResult | null;
  error: string | null;
  /** Start a purchase for the given paywalled access URL. */
  buy: (accessUrl: string) => Promise<void>;
  /** Reset back to the idle state (e.g. when the modal closes). */
  reset: () => void;
}

/**
 * Drives a single x402 purchase: preflights the wallet network, runs the
 * Freighter-signed payment, and exposes loading / success / error states plus
 * the settlement result (tx hash, receipt, or download).
 *
 * @param address - The connected wallet address, or null when disconnected.
 */
export function useBuyResource(address: string | null): BuyState {
  const [status, setStatus] = useState<BuyStatus>("idle");
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against overlapping clicks resolving out of order.
  const inFlight = useRef(false);

  const buy = useCallback(
    async (accessUrl: string) => {
      if (inFlight.current) return;

      if (!address) {
        setStatus("error");
        setError("Connect your Freighter wallet before buying.");
        return;
      }

      inFlight.current = true;
      setStatus("paying");
      setError(null);
      setResult(null);

      try {
        // Preflight: a wrong active network produces a confusing facilitator
        // rejection mid-flow, so catch it before asking the user to sign.
        const mismatch = await checkNetwork(expectedNetworkPassphrase());
        if (mismatch) throw new PurchaseError(mismatch);

        const purchase = await purchaseResource(accessUrl, address);
        setResult(purchase);
        setStatus("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Purchase failed. Please try again.");
        setStatus("error");
      } finally {
        inFlight.current = false;
      }
    },
    [address],
  );

  const reset = useCallback(() => {
    inFlight.current = false;
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, buy, reset };
}
