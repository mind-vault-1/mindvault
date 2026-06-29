import React from "react";
import { useAnalytics } from "../hooks/useAnalytics.js";
import { RecentPayment, ResourceStat } from "../api/analytics.js";

interface Props {
  apiKey: string;
}

export function AnalyticsDashboard({ apiKey }: Props) {
  const { data, loading, error } = useAnalytics(apiKey);

  if (loading)
    return (
      <p className="mt-8 text-center text-sm text-gray-500" aria-live="polite" aria-busy="true">
        Loading analytics…
      </p>
    );

  if (error)
    return (
      <p className="mt-8 text-center text-sm text-red-500" aria-live="assertive">
        Error: {error}
      </p>
    );

  if (!data) return null;

  const { summary, resources } = data;

  // Empty state
  if (summary.totalResources === 0)
    return (
      <div
        className="mt-8 rounded-xl border border-dashed border-gray-200 p-10 text-center text-gray-500"
        aria-live="polite"
      >
        <p className="text-lg font-medium">No resources yet</p>
        <p className="mt-1 text-sm">
          Publish your first resource to start earning USDC directly to your Stellar wallet.
        </p>
      </div>
    );

  return (
    <div className="mt-8 space-y-6" aria-live="polite">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total earned"
          value={`${summary.totalEarned} ${summary.currency}`}
          note="Paid directly to your Stellar wallet"
        />
        <StatCard
          label="Total sales"
          value={String(summary.totalSales)}
          note={`across ${summary.totalResources} resource${summary.totalResources !== 1 ? "s" : ""}`}
        />
        <StatCard
          label="Listed resources"
          value={`${summary.listedResources} / ${summary.totalResources}`}
          note={`${summary.verification.verified} verified · ${summary.verification.pending} pending`}
        />
      </div>

      {/* Per-resource breakdown */}
      <div className="space-y-4">
        {resources.map((r) => (
          <ResourceRow key={r.id} resource={r} />
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{note}</p>
    </div>
  );
}

function ResourceRow({ resource: r }: { resource: ResourceStat }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <p className="font-semibold text-gray-900">{r.title}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {r.price} USDC ·{" "}
            <span
              className={
                r.verificationStatus === "verified"
                  ? "text-green-600"
                  : r.verificationStatus === "rejected"
                    ? "text-red-500"
                    : "text-yellow-600"
              }
            >
              {r.verificationStatus}
            </span>{" "}
            · {r.listed ? "listed" : "unlisted"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-indigo-600">{r.totalEarned} USDC</p>
          <p className="text-xs text-gray-400">
            {r.totalSales} sale{r.totalSales !== 1 ? "s" : ""}
          </p>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-4">
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">
            Resource URL
          </p>
          <a
            href={r.accessUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-xs text-indigo-500 hover:underline"
          >
            {r.accessUrl}
          </a>

          {r.recentPayments.length > 0 && (
            <>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-500">
                Recent payments
              </p>
              <ul className="mt-2 space-y-2">
                {r.recentPayments.map((p, i) => (
                  <PaymentRow key={i} payment={p} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentRow({ payment: p }: { payment: RecentPayment }) {
  return (
    <li className="flex items-center justify-between text-xs text-gray-600">
      <span className="font-mono">
        {p.payerAddress.slice(0, 8)}…{p.payerAddress.slice(-4)}
      </span>
      <span className="ml-2 font-medium text-gray-900">{p.amount} USDC</span>
      <span className="ml-2 text-gray-400">{new Date(p.paidAt).toLocaleDateString()}</span>
    </li>
  );
}
