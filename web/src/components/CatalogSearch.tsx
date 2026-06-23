import React from "react";
import type { CatalogFilters } from "../api/resources.js";

interface Props {
  filters: CatalogFilters;
  total: number;
  filtered: number;
  onChange: (filters: CatalogFilters) => void;
  onReset: () => void;
}

export function CatalogSearch({ filters, total, filtered, onChange, onReset }: Props) {
  const hasActiveFilters =
    !!filters.search ||
    !!filters.minPrice ||
    !!filters.maxPrice ||
    (filters.verificationStatus && filters.verificationStatus !== "all") ||
    (filters.resourceType && filters.resourceType !== "all");

  return (
    <div className="mb-6 space-y-3">
      {/* Search box */}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
        </span>
        <input
          type="search"
          aria-label="Search resources"
          placeholder="Search by title…"
          value={filters.search ?? ""}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-800"
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Verification status */}
        <select
          aria-label="Filter by verification status"
          value={filters.verificationStatus ?? "all"}
          onChange={(e) =>
            onChange({
              ...filters,
              verificationStatus: e.target.value as CatalogFilters["verificationStatus"],
            })
          }
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-indigo-500"
        >
          <option value="all">All statuses</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>

        {/* Resource type */}
        <select
          aria-label="Filter by resource type"
          value={filters.resourceType ?? "all"}
          onChange={(e) =>
            onChange({
              ...filters,
              resourceType: e.target.value as CatalogFilters["resourceType"],
            })
          }
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-indigo-500"
        >
          <option value="all">All types</option>
          <option value="file">File</option>
          <option value="link">Link</option>
        </select>

        {/* Price range */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">Price</span>
          <input
            type="number"
            aria-label="Minimum price in USDC"
            placeholder="Min"
            min="0"
            step="0.01"
            value={filters.minPrice ?? ""}
            onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
            className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-indigo-500"
          />
          <span className="text-xs text-gray-400">–</span>
          <input
            type="number"
            aria-label="Maximum price in USDC"
            placeholder="Max"
            min="0"
            step="0.01"
            value={filters.maxPrice ?? ""}
            onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
            className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-indigo-500"
          />
          <span className="text-xs text-gray-400">USDC</span>
        </div>

        {/* Reset */}
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            Clear filters
          </button>
        )}

        {/* Result count */}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
          {hasActiveFilters ? (
            <>
              <span className="font-medium text-gray-600 dark:text-gray-300">{filtered}</span> of{" "}
              {total}
            </>
          ) : (
            <span className="font-medium text-gray-600 dark:text-gray-300">{total}</span>
          )}{" "}
          resource{total !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
