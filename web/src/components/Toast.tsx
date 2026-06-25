import React, { useEffect, useRef, useCallback } from "react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
  /** Auto-dismiss delay in milliseconds. */
  duration?: number;
  /** When set, displays a selectable URL below the message (e.g. clipboard fallback). */
  fallbackUrl?: string;
}

/**
 * A transient confirmation toast pinned to the bottom-right of the screen.
 * Auto-dismisses after `duration` ms. When a `fallbackUrl` is provided the
 * toast stays longer and renders the URL in a selectable input so the user
 * can copy it manually.
 */
export function Toast({ message, onDismiss, duration = 2500, fallbackUrl }: ToastProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-select the fallback URL text on mount so the user can Ctrl+C immediately
  useEffect(() => {
    if (fallbackUrl && inputRef.current) {
      inputRef.current.select();
    }
  }, [fallbackUrl]);

  // Use a longer duration when showing a fallback URL so users have time to copy
  const effectiveDuration = fallbackUrl ? Math.max(duration, 8000) : duration;

  useEffect(() => {
    const timer = setTimeout(onDismiss, effectiveDuration);
    return () => clearTimeout(timer);
  }, [message, effectiveDuration, onDismiss]);

  const handleSelectAll = useCallback(() => {
    inputRef.current?.select();
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex max-w-sm flex-col gap-2 rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-gray-100 dark:text-gray-900"
    >
      <span>{message}</span>
      {fallbackUrl && (
        <input
          ref={inputRef}
          type="text"
          readOnly
          value={fallbackUrl}
          onClick={handleSelectAll}
          aria-label="Resource URL"
          className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-300 dark:bg-gray-200 dark:text-gray-800"
        />
      )}
    </div>
  );
}
