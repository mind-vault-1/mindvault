import React, { useState } from "react";
import { useTransferOwnership } from "../hooks/useTransferOwnership.js";

interface Props {
  resourceId: string;
  apiKey: string;
  onClose: () => void;
  onConfirmed: (newCreator: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  idle: "",
  preparing: "Building transaction…",
  signing: "Waiting for wallet signature…",
  submitting: "Submitting to Stellar…",
  confirmed: "Ownership transferred!",
  error: "",
};

export function TransferOwnershipModal({ resourceId, apiKey, onClose, onConfirmed }: Props) {
  const [newCreator, setNewCreator] = useState("");
  const { status, newOwner, error, networkWarning, transferOwnership } = useTransferOwnership(
    resourceId,
    apiKey,
  );

  const busy = ["preparing", "signing", "submitting"].includes(status);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    transferOwnership(newCreator.trim());
  }

  if (status === "confirmed" && newOwner) {
    onConfirmed(newOwner);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Transfer Ownership</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-creator" className="block text-sm font-medium text-gray-700">
              New owner address (Stellar public key)
            </label>
            <input
              id="new-creator"
              type="text"
              placeholder="G…"
              value={newCreator}
              onChange={(e) => setNewCreator(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              required
            />
          </div>

          {STATUS_LABELS[status] && (
            <p className="text-sm text-indigo-600">{STATUS_LABELS[status]}</p>
          )}

          {networkWarning && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠️ {networkWarning}
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {status === "confirmed" && newOwner && (
            <p className="break-all text-sm font-medium text-green-600">
              Ownership transferred to {newOwner}.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              {status === "confirmed" ? "Close" : "Cancel"}
            </button>
            {status !== "confirmed" && (
              <button
                type="submit"
                disabled={busy || !newCreator.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Working…" : "Transfer"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
