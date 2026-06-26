import React, { useMemo } from "react";
import { useAsync } from "../hooks/useAsync.js";
import { ErrorBanner } from "./ErrorBanner.js";
import { ResourceGridSkeleton } from "./ResourceCardSkeleton.js";
import { ExplorerLink } from "./ExplorerLink.js";
import { fetchMyResources } from "../api/resources.js";

export interface DashboardResource {
  id: string;
  title: string;
  price: string;
  resourceType: string;
  walletAddress: string;
  verificationStatus: string;
  onchainStatus: string;
  onchainTxHash?: string;
  listed: boolean;
  accessUrl: string;
}

interface Props {
  apiKey: string;
  onEditPrice: (resource: DashboardResource) => void;
  onTransferOwnership: (resource: DashboardResource) => void;
  onRegister: (resource: DashboardResource) => void;
}

const needsRegistration = (r: DashboardResource) =>
  r.verificationStatus === "verified" && r.onchainStatus !== "registered";

/**
 * Creator-only view of resources published by the authenticated API key,
 * separate from the public catalog. Surfaces verification, on-chain, price,
 * and listing state, plus entry points into the existing edit-price,
 * transfer-ownership, and register flows (#164).
 */
export function CreatorDashboard({ apiKey, onEditPrice, onTransferOwnership, onRegister }: Props) {
  const { status, data, error, retry } = useAsync<DashboardResource[]>(
    () => fetchMyResources(apiKey),
    [apiKey],
  );

  const resources = data ?? [];
  const isLoading = status === "idle" || status === "loading";

  const summary = useMemo(() => {
    const listed = resources.filter((r) => r.listed).length;
    const verified = resources.filter((r) => r.verificationStatus === "verified").length;
    const registered = resources.filter((r) => r.onchainStatus === "registered").length;
    const pendingRegistration = resources.filter(needsRegistration).length;
    return { total: resources.length, listed, verified, registered, pendingRegistration };
  }, [resources]);

  if (isLoading) return <ResourceGridSkeleton count={6} />;

  if (status === "error") {
    return <ErrorBanner message={error ?? "Failed to load your resources."} onRetry={retry} />;
  }

  if (resources.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-gray-200 p-10 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
        <p className="text-lg font-medium">No resources yet</p>
        <p className="mt-1 text-sm">Publish a resource to see it show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryStat label="Total resources" value={summary.total} />
        <SummaryStat label="Listed" value={summary.listed} />
        <SummaryStat label="Verified" value={summary.verified} />
        <SummaryStat label="Registered on-chain" value={summary.registered} />
      </div>

      {summary.pendingRegistration > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {summary.pendingRegistration} resource{summary.pendingRegistration !== 1 ? "s" : ""}{" "}
            verified but not yet registered on-chain.
          </p>
        </div>
      )}

      {/* Owned resource list */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr>
              <Th>Title</Th>
              <Th>Price</Th>
              <Th>Listing</Th>
              <Th>Verification</Th>
              <Th>On-chain</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {resources.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{r.title}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{r.resourceType}</p>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  {r.price} USDC
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    label={r.listed ? "listed" : "unlisted"}
                    tone={r.listed ? "green" : "gray"}
                  />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    label={r.verificationStatus}
                    tone={
                      r.verificationStatus === "verified"
                        ? "green"
                        : r.verificationStatus === "rejected"
                          ? "red"
                          : "gray"
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge
                      label={r.onchainStatus === "none" ? "not on-chain" : r.onchainStatus}
                      tone={
                        r.onchainStatus === "registered"
                          ? "indigo"
                          : r.onchainStatus === "failed"
                            ? "red"
                            : r.onchainStatus === "pending"
                              ? "yellow"
                              : "gray"
                      }
                    />
                    {r.onchainStatus === "registered" && r.onchainTxHash && (
                      <ExplorerLink
                        type="tx"
                        value={r.onchainTxHash}
                        className="text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400"
                      >
                        ↗
                      </ExplorerLink>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1.5">
                    {needsRegistration(r) && (
                      <button
                        onClick={() => onRegister(r)}
                        className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600"
                      >
                        Register
                      </button>
                    )}
                    <button
                      onClick={() => onEditPrice(r)}
                      className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    >
                      Edit price
                    </button>
                    <button
                      onClick={() => onTransferOwnership(r)}
                      className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    >
                      Transfer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {children}
    </th>
  );
}

const TONE_CLASSES: Record<string, string> = {
  green: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  gray: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
};

function StatusBadge({ label, tone }: { label: string; tone: keyof typeof TONE_CLASSES }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}
