import React from "react";
import { useAsync } from "../hooks/useAsync.js";
import { fetchLeaderboard, type LeaderboardEntry } from "../api/resources.js";
import { ExplorerLink } from "./ExplorerLink.js";
import { ErrorBanner } from "./ErrorBanner.js";

function truncateWallet(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Leaderboard() {
  const {
    status,
    data: entries,
    error,
    retry,
  } = useAsync<LeaderboardEntry[]>((signal) => fetchLeaderboard(signal), []);

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  if (status === "error") {
    return <ErrorBanner message={error ?? "Failed to load leaderboard."} onRetry={retry} />;
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-gray-400 dark:text-gray-500">
        No publishers yet. Be the first to publish a resource!
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">Creator</th>
            <th className="px-4 py-3">Wallet</th>
            <th className="px-4 py-3 text-right">Resources</th>
            <th className="px-4 py-3 text-right">Sales</th>
            <th className="px-4 py-3 text-right">Earned (USDC)</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, idx) => (
            <tr
              key={entry.id}
              className="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
            >
              <td className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">{idx + 1}</td>
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                {entry.name}
              </td>
              <td className="px-4 py-3">
                <ExplorerLink
                  type="account"
                  value={entry.walletAddress}
                  className="text-xs text-gray-500 dark:text-gray-400"
                >
                  {truncateWallet(entry.walletAddress)}
                </ExplorerLink>
              </td>
              <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                {entry.totalResources}
              </td>
              <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                {entry.totalSales}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-indigo-600 dark:text-indigo-400">
                {entry.totalEarned}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
