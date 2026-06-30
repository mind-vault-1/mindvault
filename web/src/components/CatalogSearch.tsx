import React, { useCallback, useId, useRef, useState } from "react";
import type { CatalogFilters } from "../api/resources.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  id: string;
  title: string;
  /** Optional secondary text shown below the title in the results list. */
  subtitle?: string;
}

interface Props {
  filters: CatalogFilters;
  total: number;
  filtered: number;
  onChange: (filters: CatalogFilters) => void;
  onReset: () => void;
  /** When provided, renders a keyboard-navigable results list below the search box. */
  results?: SearchResult[];
  /** Called when a result is activated (Enter key or click). */
  onActivate?: (result: SearchResult) => void;
}

// ---------------------------------------------------------------------------
// CatalogSearch
// ---------------------------------------------------------------------------

export function CatalogSearch({
  filters,
  total,
  filtered,
  onChange,
  onReset,
  results,
  onActivate,
}: Props) {
  const hasActiveFilters =
    !!filters.search ||
    !!filters.minPrice ||
    !!filters.maxPrice ||
    (filters.verificationStatus && filters.verificationStatus !== "all") ||
    (filters.resourceType && filters.resourceType !== "all");

  // ── Keyboard navigation state ──────────────────────────────────────────────

  const listboxId = useId();
  // Index of the currently focused result (-1 means none).
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  const hasResults = results && results.length > 0;

  // Reset the active index whenever the results list changes.
  const prevResultsRef = useRef<SearchResult[] | undefined>(undefined);
  if (results !== prevResultsRef.current) {
    prevResultsRef.current = results;
    // Only reset if there's a real change (avoids resetting on stable renders).
    if (activeIndex !== -1) setActiveIndex(-1);
  }

  const moveActive = useCallback((delta: number, resultCount: number) => {
    setActiveIndex((prev) => {
      const next = prev + delta;
      if (next < 0) return resultCount - 1;
      if (next >= resultCount) return 0;
      return next;
    });
  }, []);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!hasResults) return;
      const count = results!.length;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1 >= count ? 0 : prev + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 < 0 ? count - 1 : prev - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < count) {
          onActivate?.(results![activeIndex]);
          setActiveIndex(-1);
        }
      } else if (e.key === "Escape") {
        setActiveIndex(-1);
      }
    },
    [hasResults, results, activeIndex, onActivate],
  );

  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLLIElement>, index: number, result: SearchResult) => {
      const count = results?.length ?? 0;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = (index + 1) % count;
        setActiveIndex(next);
        itemRefs.current[next]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (index === 0) {
          setActiveIndex(-1);
          inputRef.current?.focus();
        } else {
          const prev = index - 1;
          setActiveIndex(prev);
          itemRefs.current[prev]?.focus();
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate?.(result);
        setActiveIndex(-1);
        inputRef.current?.focus();
      } else if (e.key === "Escape") {
        setActiveIndex(-1);
        inputRef.current?.focus();
      }
    },
    [results, onActivate],
  );

  const activeDescendant =
    hasResults && activeIndex >= 0 ? `${listboxId}-item-${activeIndex}` : undefined;

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
          ref={inputRef}
          type="search"
          role={hasResults ? "combobox" : undefined}
          aria-label="Search resources"
          aria-expanded={hasResults ? true : undefined}
          aria-controls={hasResults ? listboxId : undefined}
          aria-activedescendant={activeDescendant}
          aria-autocomplete={hasResults ? "list" : undefined}
          placeholder="Search by title…"
          value={filters.search ?? ""}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          onKeyDown={handleInputKeyDown}
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-800"
        />

        {/* Keyboard-navigable results list (#311) */}
        {hasResults && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Search results"
            className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            {results!.map((result, index) => {
              const isActive = index === activeIndex;
              const itemId = `${listboxId}-item-${index}`;
              return (
                <li
                  key={result.id}
                  id={itemId}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  role="option"
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  onKeyDown={(e) => handleItemKeyDown(e, index, result)}
                  onClick={() => {
                    onActivate?.(result);
                    setActiveIndex(-1);
                    inputRef.current?.focus();
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`cursor-pointer select-none px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                      : "text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  <span className="block font-medium">{result.title}</span>
                  {result.subtitle && (
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {result.subtitle}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
