import React from "react";
import type { WalletState } from "../hooks/useWalletConnection.js";

interface Props {
  wallet: WalletState;
}

/** Truncates a Stellar address to G…XXXX for display. */
function shortAddress(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

/**
 * Header wallet button.
 *
 * - "restoring" → subtle skeleton so the header doesn't jump
 * - "disconnected" / "error" → "Connect wallet" button
 * - "connected" → address chip + disconnect button
 */
export function WalletButton({ wallet }: Props) {
  const { status, address, error, connect, disconnect } = wallet;

  if (status === "restoring") {
    return (
      <div
        aria-label="Restoring wallet connection…"
        className="h-8 w-32 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
      />
    );
  }

  if (status === "connected" && address) {
    return (
      <div className="flex items-center gap-2">
        {/* Green dot + address */}
        <span
          title={address}
          className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
        >
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-green-500 dark:bg-green-400"
          />
          {shortAddress(address)}
        </span>

        {/* Disconnect */}
        <button
          onClick={disconnect}
          aria-label="Disconnect wallet"
          title="Disconnect wallet"
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // disconnected or error
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={connect}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-indigo-500 dark:hover:bg-indigo-600"
      >
        Connect wallet
      </button>
      {error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-500 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
