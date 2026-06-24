import React, { useMemo, useState } from "react";
import { EditPriceModal } from "./components/EditPriceModal.js";
import { TransferOwnershipModal } from "./components/TransferOwnershipModal.js";
import { RegisterModal } from "./components/RegisterModal.js";
import { ResourcePreviewModal } from "./components/ResourcePreviewModal.js";
import { ExplorerLink } from "./components/ExplorerLink.js";
import { Toast } from "./components/Toast.js";
import { CatalogSearch } from "./components/CatalogSearch.js";
import { ResourceGridSkeleton } from "./components/ResourceCardSkeleton.js";
import { ErrorBanner } from "./components/ErrorBanner.js";
import { WalletButton } from "./components/WalletButton.js";
import { AnalyticsDashboard } from "./components/AnalyticsDashboard.js";
import { Leaderboard } from "./components/Leaderboard.js";
import { PublishModal } from "./components/PublishModal.js";
import { useTheme } from "./hooks/useTheme.js";
import { useAsync } from "./hooks/useAsync.js";
import { useWalletConnection } from "./hooks/useWalletConnection.js";
import { fetchCatalog, fetchMyResources, fetchRegistryStatus } from "./api/resources.js";
import type { CatalogFilters } from "./api/resources.js";

interface Resource {
  id: string;
  title: string;
  price: string;
  resourceType: string;
  publisherName?: string;
  walletAddress: string;
  verificationStatus: string;
  onchainStatus: string;
  onchainTxHash?: string;
  listed: boolean;
  accessUrl: string;
}

type ActiveModal =
  | { kind: "editPrice"; resource: Resource }
  | { kind: "transferOwnership"; resource: Resource }
  | { kind: "register"; resource: Resource }
  | { kind: "preview"; resource: Resource }
  | null;

type Tab = "catalog" | "analytics" | "leaderboard";

const API_KEY = import.meta.env.VITE_API_KEY ?? "";

const DEFAULT_FILTERS: CatalogFilters = {
  search: "",
  minPrice: "",
  maxPrice: "",
  verificationStatus: "all",
  resourceType: "all",
};

export default function App() {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [overrides, setOverrides] = useState<Record<string, Partial<Resource>>>({});
  const [tab, setTab] = useState<Tab>("catalog");
  const [showPublish, setShowPublish] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const wallet = useWalletConnection();

  // ── Catalog / my-resources fetch ──────────────────────────────────────────
  const {
    status: resourcesStatus,
    data: rawResources,
    error: resourcesError,
    retry: retryResources,
  } = useAsync<Resource[]>(
    (_signal) => (API_KEY ? fetchMyResources(API_KEY) : fetchCatalog(filters)),
    [filters],
  );

  // ── Registry status fetch ─────────────────────────────────────────────────
  const {
    status: registryStatus,
    data: registryData,
    error: _registryError,
    retry: retryRegistry,
  } = useAsync<{ resourceCount: number }>((_signal) => fetchRegistryStatus(), []);

  const filteredResources: Resource[] = useMemo(() => {
    if (!rawResources) return [];
    return rawResources.map((r) => ({ ...r, ...(overrides[r.id] ?? {}) }));
  }, [rawResources, overrides]);

  async function handleCopyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setToast("Resource URL copied to clipboard");
    } catch {
      setToast("Failed to copy URL");
    }
  }

  function applyOverride(id: string, patch: Partial<Resource>) {
    setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  }

  function handlePriceConfirmed(id: string, price: string) {
    applyOverride(id, { price });
    setActiveModal(null);
  }

  function handleOwnershipConfirmed(id: string, newCreator: string) {
    applyOverride(id, { walletAddress: newCreator });
    setActiveModal(null);
  }

  function handleRegistrationConfirmed(id: string, _txHash: string) {
    applyOverride(id, { onchainStatus: "registered" });
    setActiveModal(null);
  }

  const needsRegistration = (r: Resource) =>
    r.verificationStatus === "verified" && r.onchainStatus !== "registered";

  const registryCount = registryData?.resourceCount ?? null;
  const isLoading = resourcesStatus === "idle" || resourcesStatus === "loading";

  return (
    <div className="min-h-screen bg-gray-50 p-8 dark:bg-gray-900">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">MindVault</h1>
          {registryStatus === "error" ? (
            <div className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                />
              </svg>
              <span>Registry status unavailable</span>
              <button
                onClick={retryRegistry}
                className="ml-1 text-xs font-medium underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          ) : registryCount !== null ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Registry:{" "}
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {registryCount}
              </span>{" "}
              resource{registryCount !== 1 ? "s" : ""} registered on-chain
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <TabButton active={tab === "catalog"} onClick={() => setTab("catalog")}>
            Catalog
          </TabButton>
          <TabButton active={tab === "leaderboard"} onClick={() => setTab("leaderboard")}>
            Leaderboard
          </TabButton>
          {API_KEY && (
            <>
              <TabButton active={tab === "analytics"} onClick={() => setTab("analytics")}>
                My Analytics
              </TabButton>
              <button
                onClick={() => setShowPublish(true)}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Publish
              </button>
            </>
          )}
          <WalletButton wallet={wallet} />
          <button
            onClick={toggleTheme}
            aria-label="Toggle light/dark theme"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </div>

      {/* ── Leaderboard tab ────────────────────────────────────────────────── */}
      {tab === "leaderboard" && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Creator Leaderboard
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Top creators ranked by total USDC earned
            </p>
          </div>
          <Leaderboard />
        </div>
      )}
      {/* ── Analytics tab ───────────────────────────────────────────────────── */}
      {tab === "analytics" && API_KEY && <AnalyticsDashboard apiKey={API_KEY} />}

      {tab === "catalog" && (
        <>
          {/* ── Pending registration banner ──────────────────────────────────── */}
          {API_KEY && filteredResources.some(needsRegistration) && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {filteredResources.filter(needsRegistration).length} resource(s) verified but not
                yet registered on-chain.
              </p>
            </div>
          )}

          {/* ── Search + filter bar ──────────────────────────────────────────── */}
          {!API_KEY && !isLoading && resourcesStatus === "success" && (
            <CatalogSearch
              filters={filters}
              total={filteredResources.length}
              filtered={filteredResources.length}
              onChange={setFilters}
              onReset={() => setFilters(DEFAULT_FILTERS)}
            />
          )}

          {/* ── Loading skeleton ─────────────────────────────────────────────── */}
          {isLoading && <ResourceGridSkeleton count={6} />}

          {/* ── Error state ──────────────────────────────────────────────────── */}
          {resourcesStatus === "error" && (
            <ErrorBanner
              message={resourcesError ?? "Failed to load resources."}
              onRetry={retryResources}
            />
          )}

          {/* ── Resource grid ────────────────────────────────────────────────── */}
          {resourcesStatus === "success" && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredResources.length === 0 &&
              (filters.search ||
                filters.verificationStatus !== "all" ||
                filters.resourceType !== "all" ||
                filters.minPrice ||
                filters.maxPrice) ? (
                <div className="col-span-full py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                  No resources match your filters.{" "}
                  <button
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="text-indigo-500 underline hover:text-indigo-700 dark:text-indigo-400"
                  >
                    Clear filters
                  </button>
                </div>
              ) : filteredResources.length === 0 ? (
                <div className="col-span-full flex flex-col items-center gap-4 py-20 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-8 w-8 text-indigo-400 dark:text-indigo-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2ZM12 12v4M10 14h4"
                      />
                    </svg>
                  </div>
                  <div className="max-w-sm space-y-1">
                    <p className="text-base font-semibold text-gray-700 dark:text-gray-200">
                      The catalog is empty
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      No resources have been published yet. Be the first to share yours with the
                      world.
                    </p>
                  </div>
                  <a
                    href="https://docs.mindvault.app/publishing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                  >
                    Publish a resource
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                      />
                    </svg>
                  </a>
                </div>
              ) : (
                filteredResources.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                  >
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{r.title}</p>
                    {r.publisherName && (
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        by {r.publisherName}
                      </p>
                    )}
                    <p
                      className="mt-1 truncate text-xs text-gray-400 dark:text-gray-500"
                      title={r.walletAddress}
                    >
                      Owner:{" "}
                      <ExplorerLink
                        type="account"
                        value={r.walletAddress}
                        className="text-gray-500 dark:text-gray-400"
                      >
                        {r.walletAddress}
                      </ExplorerLink>
                    </p>

                    <div className="mt-2 flex flex-wrap gap-1">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.verificationStatus === "verified"
                            ? "bg-green-100 text-green-700"
                            : r.verificationStatus === "rejected"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {r.verificationStatus}
                      </span>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.onchainStatus === "registered"
                            ? "bg-indigo-100 text-indigo-700"
                            : r.onchainStatus === "failed"
                              ? "bg-red-100 text-red-700"
                              : r.onchainStatus === "pending"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {r.onchainStatus === "none" ? "not on-chain" : r.onchainStatus}
                      </span>
                      {r.onchainStatus === "registered" && r.onchainTxHash && (
                        <ExplorerLink
                          type="tx"
                          value={r.onchainTxHash}
                          className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium"
                        >
                          View on Explorer ↗
                        </ExplorerLink>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                        {r.price} USDC
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setActiveModal({ kind: "preview", resource: r })}
                          className="rounded-lg bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:hover:bg-indigo-900/75"
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => handleCopyUrl(r.accessUrl)}
                          className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                        >
                          Copy URL
                        </button>
                        {API_KEY && needsRegistration(r) && (
                          <button
                            onClick={() => setActiveModal({ kind: "register", resource: r })}
                            className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600"
                          >
                            Register on-chain
                          </button>
                        )}
                        {API_KEY && (
                          <>
                            <button
                              onClick={() => setActiveModal({ kind: "editPrice", resource: r })}
                              className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                            >
                              Edit price
                            </button>
                            <button
                              onClick={() =>
                                setActiveModal({ kind: "transferOwnership", resource: r })
                              }
                              className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                            >
                              Transfer
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {activeModal?.kind === "preview" && (
        <ResourcePreviewModal
          resourceId={activeModal.resource.id}
          onClose={() => setActiveModal(null)}
          onCopyUrl={handleCopyUrl}
        />
      )}

      {activeModal?.kind === "editPrice" && (
        <EditPriceModal
          resourceId={activeModal.resource.id}
          currentPrice={activeModal.resource.price}
          apiKey={API_KEY}
          onClose={() => setActiveModal(null)}
          onConfirmed={(price) => handlePriceConfirmed(activeModal.resource.id, price)}
        />
      )}

      {activeModal?.kind === "transferOwnership" && (
        <TransferOwnershipModal
          resourceId={activeModal.resource.id}
          apiKey={API_KEY}
          onClose={() => setActiveModal(null)}
          onConfirmed={(newCreator) =>
            handleOwnershipConfirmed(activeModal.resource.id, newCreator)
          }
        />
      )}

      {activeModal?.kind === "register" && (
        <RegisterModal
          resourceId={activeModal.resource.id}
          apiKey={API_KEY}
          onClose={() => setActiveModal(null)}
          onConfirmed={(txHash) => handleRegistrationConfirmed(activeModal.resource.id, txHash)}
        />
      )}

      {showPublish && API_KEY && (
        <PublishModal
          apiKey={API_KEY}
          onClose={() => setShowPublish(false)}
          onPublished={() => retryResources()}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
      }`}
    >
      {children}
    </button>
  );
}
