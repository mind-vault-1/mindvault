import React, { useEffect } from "react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
  /** Auto-dismiss delay in milliseconds. */
  duration?: number;
}

/**
 * A transient confirmation toast pinned to the bottom-right of the screen.
 * Auto-dismisses after `duration` ms.
 */
export function Toast({ message, onDismiss, duration = 2500 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-gray-100 dark:text-gray-900"
    >
      {message}
    </div>
  );
}
