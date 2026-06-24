import React, { useEffect, useRef, useCallback } from "react";
import { fetchResourceMeta } from "../api/resources.js";
import { useAsync } from "../hooks/useAsync.js";
import { ErrorBanner } from "./ErrorBanner.js";
import { ExplorerLink } from "./ExplorerLink.js";

interface ResourcePreviewModalProps {
  resourceId: string;
  onClose: () => void;
  onCopyUrl?: (url: string) => void;
}

export function ResourcePreviewModal({
  resourceId,
  onClose,
  onCopyUrl,
}: ResourcePreviewModalProps) {
  const { status, data, error, retry } = useAsync(
    (signal) => fetchResourceMeta(resourceId, signal),
    [resourceId],
  );

  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus management
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    if (dialogRef.current) {
      dialogRef.current.focus();
    }
    return () => {
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Focus trap
  const handleTabKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    if (!dialogRef.current) return;

    const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstElement || document.activeElement === dialogRef.current) {
        lastElement?.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement?.focus();
        e.preventDefault();
      }
    }
  }, []);

  // Lock body scroll
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        aria-describedby={data?.description ? "preview-desc" : undefined}
        tabIndex={-1}
        onKeyDown={handleTabKey}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800 outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="preview-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Resource Preview
          </h2>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4">
          {(status === "idle" || status === "loading") && (
            <div
              role="status"
              aria-busy="true"
              className="flex flex-col items-center justify-center py-12"
            >
              <svg
                className="h-8 w-8 animate-spin text-indigo-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="sr-only">Loading preview…</span>
            </div>
          )}

          {status === "error" && (
            <ErrorBanner message={error ?? "Failed to load resource preview."} onRetry={retry} />
          )}

          {status === "success" && data && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {data.title}
                </h3>
                {data.publisherName && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    by {data.publisherName}
                  </p>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Description
                </h4>
                {data.description ? (
                  <p id="preview-desc" className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {data.description}
                  </p>
                ) : (
                  <p
                    id="preview-desc"
                    className="mt-1 text-sm italic text-gray-400 dark:text-gray-500"
                  >
                    No description provided.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Price
                  </p>
                  <p className="mt-1 font-medium text-indigo-600 dark:text-indigo-400">
                    {data.price} USDC
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Type
                  </p>
                  <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                    {data.resourceType}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Verification
                  </p>
                  <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                    {data.verificationStatus}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    On-chain Status
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {data.onchainStatus === "none" ? "not on-chain" : data.onchainStatus}
                    </span>
                    {data.onchainStatus === "registered" && data.onchainTxHash && (
                      <ExplorerLink
                        type="tx"
                        value={data.onchainTxHash}
                        className="text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300"
                      >
                        ↗
                      </ExplorerLink>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    onCopyUrl?.(data.accessUrl);
                  }}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                >
                  Copy access URL
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
