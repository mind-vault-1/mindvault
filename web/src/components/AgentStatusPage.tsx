import { fetchAgentStatus, type AgentActivity } from "../api/agent.js";
import { useAsync } from "../hooks/useAsync.js";
import { ErrorBanner } from "./ErrorBanner.js";
import { ExplorerLink } from "./ExplorerLink.js";

/**
 * Verification agent status page (issue #221).
 *
 * Surfaces the public `GET /agent/status` feed in the web UI — verifications
 * processed, approved, rejected, and USDC earned — so the README's "full
 * activity feed is visible on the Agent page" claim holds without using MCP.
 */
export function AgentStatusPage() {
  const { status, data, error, retry } = useAsync((signal) => fetchAgentStatus(signal), []);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (status === "idle" || status === "loading") {
    return (
      <div className="mt-8" role="status" aria-busy="true">
        <span className="sr-only">Loading agent status…</span>
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="mt-8">
        <ErrorBanner message={error ?? "Failed to load agent status."} onRetry={retry} />
      </div>
    );
  }

  if (!data) return null;

  const { agent, stats, recentActivity } = data;

  return (
    <section aria-labelledby="agent-heading" className="mt-8 space-y-6">
      {/* ── Agent identity ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="agent-heading"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              {agent.name}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Owner:{" "}
              <ExplorerLink
                type="account"
                value={agent.walletAddress}
                className="text-gray-600 dark:text-gray-300"
              >
                {agent.walletAddress}
              </ExplorerLink>
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {agent.network} · {agent.pricePerVerification} {agent.currency} per verification
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              agent.status === "active"
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                agent.status === "active" ? "bg-green-500" : "bg-gray-400"
              }`}
              aria-hidden="true"
            />
            {agent.status}
          </span>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Verifications processed" value={String(stats.totalVerifications)} />
        <StatCard
          label="Approved"
          value={String(stats.verified)}
          accent="text-green-600 dark:text-green-400"
        />
        <StatCard
          label="Rejected"
          value={String(stats.rejected)}
          accent="text-red-600 dark:text-red-400"
        />
        <StatCard
          label="USDC earned"
          value={`${stats.totalEarned}`}
          note={`avg confidence ${stats.avgConfidence}`}
          accent="text-indigo-600 dark:text-indigo-400"
        />
      </div>

      {/* ── Recent activity ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Recent activity
          </h3>
        </div>
        {recentActivity.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
            No verifications yet. Activity will appear here once the agent processes its first
            request.
          </p>
        ) : (
          <ul role="list" className="divide-y divide-gray-100 dark:divide-gray-700">
            {recentActivity.map((a) => (
              <ActivityRow key={a.id} activity={a} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  note,
  accent = "text-gray-900 dark:text-gray-100",
}: {
  label: string;
  value: string;
  note?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{note}</p>}
    </div>
  );
}

function ActivityRow({ activity: a }: { activity: AgentActivity }) {
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {a.resourceTitle}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {new Date(a.checkedAt).toLocaleString()} · confidence {a.confidence}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
          a.isOriginal
            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
        }`}
      >
        {a.isOriginal ? "approved" : "rejected"}
      </span>
    </li>
  );
}
