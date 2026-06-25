/// <reference path="../types/freighter.d.ts" />
import React, { useState } from "react";
import { prepareRegisterTx, submitRegisterTx, RegistrationError } from "../api/resources.js";

interface RegisterModalProps {
  resourceId: string;
  apiKey: string;
  onClose: () => void;
  onConfirmed: (txHash: string) => void;
}

type RegistrationState = "preparing" | "signing" | "submitting" | "success" | "failed";

export function RegisterModal({ resourceId, apiKey, onClose, onConfirmed }: RegisterModalProps) {
  const [state, setState] = useState<RegistrationState>("preparing");
  const [error, setError] = useState<string>("");
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [failedTxHash, setFailedTxHash] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [unsignedXdr, setUnsignedXdr] = useState<string>("");
  const [networkPassphrase, setNetworkPassphrase] = useState<string>("");

  React.useEffect(() => {
    prepareTransaction();
  }, []);

  async function prepareTransaction() {
    try {
      setState("preparing");
      setError("");
      setNextSteps([]);
      setFailedTxHash("");
      const result = await prepareRegisterTx(resourceId, apiKey);
      setUnsignedXdr(result.unsignedXdr);
      setNetworkPassphrase(result.networkPassphrase);
      setState("signing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare transaction");
      setState("failed");
    }
  }

  async function signAndSubmit() {
    try {
      setState("submitting");

      // Check if Freighter is available
      if (!window.freighterApi) {
        throw new Error("Freighter wallet not found. Please install Freighter extension.");
      }

      // Sign the transaction with Freighter
      const signedXdr = await window.freighterApi.signTransaction(unsignedXdr, {
        networkPassphrase,
      });

      // Submit the signed transaction
      const result = await submitRegisterTx(resourceId, signedXdr, apiKey);
      setTxHash(result.txHash);
      setState("success");
      onConfirmed(result.txHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign or submit transaction");
      if (err instanceof RegistrationError) {
        setNextSteps(err.nextSteps ?? []);
        setFailedTxHash(err.txHash ?? "");
      }
      setState("failed");
    }
  }

  function getExplorerUrl(hash: string): string {
    const isTestnet = networkPassphrase.includes("Test");
    const baseUrl = isTestnet
      ? "https://stellar.expert/explorer/testnet"
      : "https://stellar.expert/explorer/public";
    return `${baseUrl}/tx/${hash}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Register on Blockchain</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={state === "submitting"}
          >
            ✕
          </button>
        </div>

        <div className="mb-6">
          {state === "preparing" && (
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
              <span className="text-sm text-gray-600">Preparing transaction...</span>
            </div>
          )}

          {state === "signing" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100">
                  <span className="text-sm font-medium text-indigo-600">1</span>
                </div>
                <span className="text-sm text-gray-900">Ready to sign transaction</span>
              </div>
              <p className="text-sm text-gray-600">
                Click "Sign & Submit" to open your Freighter wallet and sign the registration
                transaction.
              </p>
            </div>
          )}

          {state === "submitting" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
                <span className="text-sm text-gray-600">Submitting to blockchain...</span>
              </div>
              <p className="text-sm text-gray-500">
                This may take up to 30 seconds. Please wait...
              </p>
            </div>
          )}

          {state === "success" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                  <span className="text-green-600">✓</span>
                </div>
                <span className="text-sm font-medium text-green-900">Registration successful!</span>
              </div>
              <p className="text-sm text-gray-600">
                Your resource has been registered on the Stellar blockchain.
              </p>
              {txHash && (
                <a
                  href={getExplorerUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  View on Stellar Explorer
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
            </div>
          )}

          {state === "failed" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                  <span className="text-red-600">✕</span>
                </div>
                <span className="text-sm font-medium text-red-900">Registration failed</span>
              </div>
              <p className="text-sm text-red-600">{error}</p>

              {nextSteps.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
                    What to do next
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
                    {nextSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}

              {failedTxHash && (
                <a
                  href={getExplorerUrl(failedTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  Check transaction status on Stellar Explorer
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {state === "signing" && (
            <button
              onClick={signAndSubmit}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Sign & Submit
            </button>
          )}

          {state === "failed" && (
            <button
              onClick={prepareTransaction}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Try Again
            </button>
          )}

          <button
            onClick={onClose}
            disabled={state === "submitting"}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "success" ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
