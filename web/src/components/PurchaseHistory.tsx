import React, { useState } from "react";
import { useAsync } from "../hooks/useAsync.js";
import { fetchPaymentHistory, fetchPaymentReceipt, type PaymentReceipt } from "../api/payments.js";
import { ErrorBanner } from "./ErrorBanner.js";

interface Props {
  walletAddress: string;
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function PurchaseHistory({ walletAddress }: Props) {
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const {
    status,
    data: payments,
    error,
    retry,
  } = useAsync<PaymentReceipt[]>((_signal) => fetchPaymentHistory(walletAddress), [walletAddress]);

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  if (status === "error") {
    return <ErrorBanner message={error ?? "Failed to load purchase history."} onRetry={retry} />;
  }

  if (!payments || payments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-indigo-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"
            />
          </svg>
        </div>
        <div className="max-w-sm space-y-1">
          <p className="text-base font-semibold text-gray-700 dark:text-gray-200">
            No purchases yet
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            When you purchase resources, your payment history will appear here.
          </p>
        </div>
      </div>
    );
  }

  async function openReceipt(id: string) {
    setReceiptError(null);
    setReceiptLoading(true);
    setReceipt(null);
    try {
      const data = await fetchPaymentReceipt(id);
      setReceipt(data);
    } catch (e: any) {
      setReceiptError(e.message);
    } finally {
      setReceiptLoading(false);
    }
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <th className="px-5 py-3">Resource</th>
              <th className="px-5 py-3">Amount</th>
              <th className="px-5 py-3">Creator</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr
                key={p.id}
                className="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
              >
                <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">
                  {p.resourceTitle ?? p.resourceId.slice(0, 12) + "…"}
                </td>
                <td className="px-5 py-3 text-indigo-600 dark:text-indigo-400">
                  {p.amount} {p.currency}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                  {truncateAddress(p.recipientAddress)}
                </td>
                <td className="px-5 py-3 text-gray-600 dark:text-gray-300">
                  {new Date(p.paidAt).toLocaleDateString()}
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => openReceipt(p.id)}
                    className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    View receipt
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Receipt modal */}
      {(receipt || receiptLoading || receiptError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
            {receiptLoading && (
              <p className="text-center text-sm text-gray-500">Loading receipt…</p>
            )}
            {receiptError && (
              <div className="text-center">
                <p className="text-sm text-red-500">{receiptError}</p>
                <button
                  onClick={() => { setReceipt(null); setReceiptError(null); }}
                  className="mt-3 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            )}
            {receipt && (
              <>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Payment Receipt
                </h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Resource</dt>
                    <dd className="font-medium text-gray-900 dark:text-gray-100">
                      {receipt.resourceTitle ?? receipt.resourceId}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Amount</dt>
                    <dd className="font-medium text-indigo-600 dark:text-indigo-400">
                      {receipt.amount} {receipt.currency}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Paid to</dt>
                    <dd className="font-mono text-xs text-gray-700 dark:text-gray-300">
                      {receipt.recipientAddress}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Paid by</dt>
                    <dd className="font-mono text-xs text-gray-700 dark:text-gray-300">
                      {receipt.payerAddress}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Date</dt>
                    <dd className="text-gray-900 dark:text-gray-100">
                      {new Date(receipt.paidAt).toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Receipt ID</dt>
                    <dd className="font-mono text-xs text-gray-600 dark:text-gray-400">
                      {receipt.id}
                    </dd>
                  </div>
                </dl>
                <button
                  onClick={() => { setReceipt(null); setReceiptError(null); }}
                  className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
