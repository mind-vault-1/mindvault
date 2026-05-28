import React, { useEffect, useState } from "react";
import { EditPriceModal } from "./components/EditPriceModal.js";
import { fetchMyResources, registerOnChain } from "./api/resources.js";

interface Resource {
  id: string;
  title: string;
  price: string;
  resourceType: string;
  publisherName?: string;
  verificationStatus: string;
  onchainStatus: string;
  listed: boolean;
}

const API_KEY = import.meta.env.VITE_API_KEY ?? "";

export default function App() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [editTarget, setEditTarget] = useState<Resource | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (API_KEY) {
      fetchMyResources(API_KEY)
        .then(setResources)
        .catch(console.error);
    } else {
      fetch("/resources")
        .then((r) => r.json())
        .then(setResources)
        .catch(console.error);
    }
  }, []);

  function handleConfirmed(id: string, price: string) {
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, price } : r)));
    setEditTarget(null);
  }

  async function handleRegister(resource: Resource) {
    setRegistering(resource.id);
    setRegisterError((prev) => ({ ...prev, [resource.id]: "" }));
    try {
      const updated = await registerOnChain(resource.id, API_KEY);
      setResources((prev) =>
        prev.map((r) => (r.id === updated.id ? { ...r, onchainStatus: updated.onchainStatus } : r))
      );
    } catch (err) {
      setRegisterError((prev) => ({
        ...prev,
        [resource.id]: err instanceof Error ? err.message : "Registration failed",
      }));
    } finally {
      setRegistering(null);
    }
  }

  // Resources eligible for on-chain registration: verified but not yet registered
  const needsRegistration = (r: Resource) =>
    r.verificationStatus === "verified" && r.onchainStatus !== "registered";

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">MindVault</h1>

      {API_KEY && resources.some(needsRegistration) && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            {resources.filter(needsRegistration).length} resource(s) verified but not yet registered on-chain.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {resources.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <p className="font-semibold text-gray-900">{r.title}</p>
            {r.publisherName && (
              <p className="mt-1 text-sm text-gray-500">by {r.publisherName}</p>
            )}

            <div className="mt-2 flex flex-wrap gap-1">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                r.verificationStatus === "verified"
                  ? "bg-green-100 text-green-700"
                  : r.verificationStatus === "rejected"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-600"
              }`}>
                {r.verificationStatus}
              </span>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                r.onchainStatus === "registered"
                  ? "bg-indigo-100 text-indigo-700"
                  : r.onchainStatus === "failed"
                  ? "bg-red-100 text-red-700"
                  : r.onchainStatus === "pending"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-500"
              }`}>
                {r.onchainStatus === "none" ? "not on-chain" : r.onchainStatus}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm font-medium text-indigo-600">{r.price} USDC</span>
              <div className="flex gap-2">
                {API_KEY && needsRegistration(r) && (
                  <button
                    onClick={() => handleRegister(r)}
                    disabled={registering === r.id}
                    className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {registering === r.id ? "Registering…" : "Register on-chain"}
                  </button>
                )}
                {API_KEY && (
                  <button
                    onClick={() => setEditTarget(r)}
                    className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                  >
                    Edit price
                  </button>
                )}
              </div>
            </div>

            {registerError[r.id] && (
              <p className="mt-2 text-xs text-red-600">{registerError[r.id]}</p>
            )}
          </div>
        ))}
      </div>

      {editTarget && (
        <EditPriceModal
          resourceId={editTarget.id}
          currentPrice={editTarget.price}
          apiKey={API_KEY}
          onClose={() => setEditTarget(null)}
          onConfirmed={(price) => handleConfirmed(editTarget.id, price)}
        />
      )}
    </div>
  );
}
