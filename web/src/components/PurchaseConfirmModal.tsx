import React, { useState } from "react";
import { ExplorerLink } from "./ExplorerLink.js";

export interface PurchaseResource {
  id: string;
  title: string;
  price: string;
  walletAddress: string;
  accessUrl: string;
}

interface Props {
  resource: PurchaseResource;
  onClose: () => void;
}

type PurchaseState = "confirm" | "submitting" | "success" | "failed";

const NETWORK_LABEL = (() => {
  const raw = (import.meta.env.VITE_STELLAR_NETWORK as string | undefined)?.trim().toLowerCase();
  if (raw === "public" || raw === "mainnet" || raw === "pubnet") return "Stellar Mainnet";
  return "Stellar Testnet";
})();

/**
 * Confirmation step shown before a buyer pays for a resource through their
 * browser wallet (#168). Summarizes what they're about to pay for, then opens
 * the paywalled resource URL, which triggers the x402 402 → sign → settle flow
 * documented in docs/x402-browser-payment-walkthrough.md. Surfaces success and
 * failure states, with an Explorer link once a transaction hash is known.
 */
export function PurchaseConfirmModal({ resource, onClose }: Props) {
  const [state, setState] = useState<PurchaseState>("confirm");
  const [error, setError] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");

  async function attemptPurchase() {
    setState("submitting");
    setError("");

    try {
      const res = await fetch(resource.accessUrl);

      if (res.status === 402) {
        // Plain fetch can't complete an x402 payment — the buyer needs an
        // x402-aware wallet flow. Open the URL directly so the browser/wallet
        // extension can take over signing, matching the documented buyer path.
        window.open(resource.accessUrl, "_blank", "noopener,noreferrer");
        setError(
          "Payment required. We opened the resource link in a new tab — approve the payment in your Stellar wallet, then check back here.",
        );
        setState("failed");
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: undefined }));
        throw new Error(body.error ?? `Purchase failed (HTTP ${res.status})`);
      }

      const paymentId = res.headers.get("X-Payment-Id");
      const contentType = res.headers.get("Content-Type") ?? "";

      if (contentType.includes("application/json")) {
        const body = await res.json();
        setTxHash(body?.receipt?.paymentId ?? paymentId ?? "");
      } else {
        setTxHash(paymentId ?? "");
      }

      setState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete purchase");
      setState("failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Confirm purchase
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            disabled={state === "submitting"}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {state !== "success" && (
          <div className="mb-6 space-y-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
            <Row label="Resource" value={resource.title} />
            <Row label="Price" value={`${resource.price} USDC`} />
            <Row
              label="Pay to"
              value={
                <ExplorerLink
                  type="account"
                  value={resource.walletAddress}
                  className="font-mono text-xs"
                >
                  {resource.walletAddress}
                </ExplorerLink>
              }
            />
            <Row label="Network" value={NETWORK_LABEL} />
          </div>
        )}

        {state === "confirm" && (
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            You'll be asked to approve this USDC payment with your connected Stellar wallet.
          </p>
        )}

        {state === "submitting" && (
          <div className="mb-6 flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Requesting resource…
            </span>
          </div>
        )}

        {state === "success" && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                <span className="text-green-600 dark:text-green-400">✓</span>
              </div>
              <span className="text-sm font-medium text-green-900 dark:text-green-300">
                Payment received
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              You now have access to "{resource.title}".
            </p>
            {txHash && (
              <ExplorerLink
                type="tx"
                value={txHash}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
              >
                View on Stellar Explorer ↗
              </ExplorerLink>
            )}
          </div>
        )}

        {state === "failed" && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                <span className="text-red-600 dark:text-red-400">✕</span>
              </div>
              <span className="text-sm font-medium text-red-900 dark:text-red-300">
                Purchase not complete
              </span>
            </div>
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          {(state === "confirm" || state === "failed") && (
            <button
              onClick={attemptPurchase}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {state === "failed" ? "Try again" : "Pay with wallet"}
            </button>
          )}
          <button
            onClick={onClose}
            disabled={state === "submitting"}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {state === "success" ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="truncate font-medium text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}
