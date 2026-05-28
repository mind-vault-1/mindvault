import React, { useEffect, useState } from "react";
import { EditPriceModal } from "./components/EditPriceModal.js";
import { TransferOwnershipModal } from "./components/TransferOwnershipModal.js";
import { fetchRegistryStatus } from "./api/resources.js";

interface Resource {
  id: string;
  title: string;
  price: string;
  resourceType: string;
  publisherName: string;
  walletAddress: string;
}

type ActiveModal =
  | { kind: "editPrice"; resource: Resource }
  | { kind: "transferOwnership"; resource: Resource }
  | null;

const API_KEY = import.meta.env.VITE_API_KEY ?? "";

export default function App() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [registryCount, setRegistryCount] = useState<number | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  useEffect(() => {
    fetch("/resources")
      .then((r) => r.json())
      .then(setResources)
      .catch(console.error);

    fetchRegistryStatus()
      .then((s) => setRegistryCount(s.resourceCount))
      .catch(console.error);
  }, []);

  function handlePriceConfirmed(id: string, price: string) {
    setResources((prev) =>
      prev.map((r) => (r.id === id ? { ...r, price } : r))
    );
    setActiveModal(null);
  }

  function handleOwnershipConfirmed(id: string, newCreator: string) {
    setResources((prev) =>
      prev.map((r) => (r.id === id ? { ...r, walletAddress: newCreator } : r))
    );
    setActiveModal(null);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">MindVault</h1>
        {registryCount !== null && (
          <p className="text-sm text-gray-500">
            Registry:{" "}
            <span className="font-semibold text-indigo-600">
              {registryCount}
            </span>{" "}
            resource{registryCount !== 1 ? "s" : ""} registered on-chain
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {resources.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <p className="font-semibold text-gray-900">{r.title}</p>
            <p className="mt-1 text-sm text-gray-500">by {r.publisherName}</p>
            <p className="mt-1 truncate text-xs text-gray-400" title={r.walletAddress}>
              Owner: {r.walletAddress}
            </p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-indigo-600">
                {r.price} USDC
              </span>
              {API_KEY && (
                <div className="flex gap-1">
                  <button
                    onClick={() => setActiveModal({ kind: "editPrice", resource: r })}
                    className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                  >
                    Edit price
                  </button>
                  <button
                    onClick={() =>
                      setActiveModal({ kind: "transferOwnership", resource: r })
                    }
                    className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                  >
                    Transfer
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {activeModal?.kind === "editPrice" && (
        <EditPriceModal
          resourceId={activeModal.resource.id}
          currentPrice={activeModal.resource.price}
          apiKey={API_KEY}
          onClose={() => setActiveModal(null)}
          onConfirmed={(price) =>
            handlePriceConfirmed(activeModal.resource.id, price)
          }
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
    </div>
  );
}
