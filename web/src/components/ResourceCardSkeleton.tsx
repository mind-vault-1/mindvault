import React from "react";

/**
 * Animated placeholder card shown while the resource catalog is loading.
 * Matches the dimensions of a real ResourceCard so the layout doesn't jump.
 */
export function ResourceCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      {/* Title line */}
      <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      {/* Subtitle / publisher */}
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-gray-700/60" />
      {/* Wallet address */}
      <div className="mt-2 h-3 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700/60" />

      {/* Badge row */}
      <div className="mt-3 flex gap-2">
        <div className="h-5 w-16 animate-pulse rounded-full bg-gray-100 dark:bg-gray-700/60" />
        <div className="h-5 w-20 animate-pulse rounded-full bg-gray-100 dark:bg-gray-700/60" />
      </div>

      {/* Price + actions row */}
      <div className="mt-4 flex items-center justify-between">
        <div className="h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-7 w-20 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700/60" />
      </div>
    </div>
  );
}

/** Renders `count` skeleton cards inside a matching grid. */
export function ResourceGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading resources…"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }).map((_, i) => (
        <ResourceCardSkeleton key={i} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
