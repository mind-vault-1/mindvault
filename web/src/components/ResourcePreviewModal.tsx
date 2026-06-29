import React, { useEffect, useRef, useCallback, useState } from "react";
import { fetchResourceMeta } from "../api/resources.js";
import { useAsync } from "../hooks/useAsync.js";
import { ErrorBanner } from "./ErrorBanner.js";
import { ExplorerLink } from "./ExplorerLink.js";

interface ResourcePreviewModalProps {
  resourceId: string;
  onClose: () => void;
  onCopyUrl?: (url: string) => void;
  /** Open the in-browser purchase flow for this resource (issue #219). */
  onBuy?: () => void;
}

// ---------------------------------------------------------------------------
// LazyImage – renders with a skeleton placeholder until the image has loaded.
// Falls back to a text placeholder when src is missing or the load fails.
// ---------------------------------------------------------------------------

interface LazyImageProps {
  src?: string | null;
  alt: string;
  className?: string;
}

function LazyImage({ src, alt, className = "" }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Use IntersectionObserver to defer the src assignment until the element
  // enters the viewport, avoiding any network fetch before it is visible.
  useEffect(() => {
    if (!src || !imgRef.current) return;

    const img = imgRef.current;
    let observer: IntersectionObserver | null = null;

    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            img.src = src;
            observer?.disconnect();
          }
        },
        { threshold: 0.1 },
      );
      observer.observe(img);
    } else {
      // Fallback for environments without IntersectionObserver (e.g. jsdom).
      img.src = src;
    }

    return () => observer?.disconnect();
  }, [src]);

  if (!src || errored) {
    return (
      <div
        aria-label={alt}
        className={`flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-600 text-xs ${className}`}
      >
        No preview
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-lg ${className}`}>
      {/* Skeleton shown until image loads */}
      {!loaded && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg"
        />
      )}
      <img
        ref={imgRef}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResourcePreviewModal
// ---------------------------------------------------------------------------

export function ResourcePreviewModal({
  resourceId,
  onClose,
  onCopyUrl,
  onBuy,
}: ResourcePreviewModalProps) {
  // Fetch is initiated only when the modal mounts (i.e. when it opens), so
  // content is loaded on-demand, not before the modal is rendered (#310).
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
          {/* Skeleton placeholder while loading (#310) */}
          {(status === "idle" || status === "loading") && (
            <div role="status" aria-busy="true" aria-label="Loading preview…" className="space-y-3">
              {/* Thumbnail skeleton */}
              <div className="h-32 w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
              {/* Title skeleton */}
              <div className="h-5 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              {/* Meta skeletons */}
              <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              <span className="sr-only">Loading preview…</span>
            </div>
          )}

          {status === "error" && (
            <ErrorBanner message={error ?? "Failed to load resource preview."} onRetry={retry} />
          )}

          {status === "success" && data && (
            <div className="space-y-4">
              {/* Lazy-loaded thumbnail (#310) */}
              {data.thumbnailUrl && (
                <LazyImage
                  src={data.thumbnailUrl}
                  alt={`${data.title} thumbnail`}
                  className="h-32 w-full"
                />
              )}

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

              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Content integrity
                </h4>
                {data.contentHash ? (
                  <div className="mt-1 space-y-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      SHA-256 integrity anchor recorded in the on-chain registry metadata when this
                      resource was registered. It identifies the exact content but is not a live
                      re-verification of the delivered bytes.
                    </p>
                    <div className="flex items-start gap-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-900">
                      <code className="break-all font-mono text-xs text-gray-800 dark:text-gray-200">
                        {data.contentHash}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(data.contentHash ?? "");
                        }}
                        aria-label="Copy content hash"
                        className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-gray-800"
                      >
                        Copy
                      </button>
                    </div>
                    {data.onchainStatus === "registered" && data.onchainTxHash && (
                      <ExplorerLink
                        type="tx"
                        value={data.onchainTxHash}
                        className="text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300"
                      >
                        View registration on Stellar Explorer ↗
                      </ExplorerLink>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-sm italic text-gray-400 dark:text-gray-500">
                    No integrity anchor available for this resource.
                  </p>
                )}
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
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Copy access URL
                </button>
                {onBuy && (
                  <button
                    onClick={onBuy}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  >
                    Buy {data.price} USDC
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
