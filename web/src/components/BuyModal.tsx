import React, { useEffect, useRef } from "react";
import { useBuyResource } from "../hooks/useBuyResource.js";

interface BuyModalProps {
  resourceTitle: string;
  price: string;
  recipient: string;
  accessUrl: string;
  /** Connected wallet address, or null when disconnected. */
  walletAddress: string | null;
  onClose: () => void;
  /** Copy-URL fallback so buyers can still pay via another x402 client. */
  onCopyUrl: (url: string) => void;
}

/**
 * One-click x402 purchase dialog (issue #219). Confirms price and recipient,
 * pays with Freighter, then shows the settlement result (tx hash + explorer
 * link, link URL, or file download). The Copy URL fallback stays available at
 * every step so the manual flow is never lost.
 */
export function BuyModal({
  resourceTitle,
  price,
  recipient,
  accessUrl,
  walletAddress,
  onClose,
  onCopyUrl,
}: BuyModalProps) {
  const { status, result, error, buy, reset } = useBuyResource(walletAddress);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    dialogRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  // Block close mid-payment so a half-signed flow isn't abandoned silently.
  const handleClose = () => {
    if (status === "paying") return;
    reset();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Mirror handleClose: don't allow Escape to abandon an in-flight payment.
      if (e.key !== "Escape" || status === "paying") return;
      reset();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [status, reset, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="buy-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl outline-none dark:bg-gray-800"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="buy-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Buy resource
          </h2>
          <button
            onClick={handleClose}
            aria-label="Close"
            disabled={status === "paying"}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-700"
          >
            ✕
          </button>
        </div>

        {/* ── Confirm ─────────────────────────────────────────────────────── */}
        {(status === "idle" || status === "paying") && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">{resourceTitle}</p>
            <dl className="space-y-2 rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-900">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">Price</dt>
                <dd className="font-medium text-indigo-600 dark:text-indigo-400">{price} USDC</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">Pays to</dt>
                <dd
                  className="truncate font-mono text-xs text-gray-700 dark:text-gray-300"
                  title={recipient}
                >
                  {recipient}
                </dd>
              </div>
            </dl>

            {!walletAddress && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Connect your Freighter wallet to pay, or use Copy URL below.
              </p>
            )}

            {status === "paying" ? (
              <div
                role="status"
                aria-busy="true"
                className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300"
              >
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                Approve in Freighter and wait for settlement…
              </div>
            ) : (
              <button
                onClick={() => buy(accessUrl)}
                disabled={!walletAddress}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Pay {price} USDC
              </button>
            )}
          </div>
        )}

        {/* ── Success ─────────────────────────────────────────────────────── */}
        {status === "success" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/50">
                ✓
              </span>
              Payment successful
            </div>

            {result.url && (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block break-all rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-300"
              >
                Open resource ↗
              </a>
            )}

            {result.download && (
              <a
                href={result.download.objectUrl}
                download={result.download.filename}
                className="block rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-300"
              >
                Download {result.download.filename}
              </a>
            )}

            {result.explorerUrl ? (
              <a
                href={result.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                View transaction on Stellar Explorer ↗
              </a>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Settlement confirmed. Transaction hash unavailable for this payment.
              </p>
            )}
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {status === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/50">
                ✕
              </span>
              <p>{error}</p>
            </div>
            <button
              onClick={() => buy(accessUrl)}
              disabled={!walletAddress}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Copy URL fallback (always available) ─────────────────────────── */}
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            onClick={() => onCopyUrl(accessUrl)}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Copy access URL instead
          </button>
        </div>
      </div>
    </div>
  );
}
