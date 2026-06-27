import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface AsyncState<T> {
  status: AsyncStatus;
  data: T | null;
  error: string | null;
  /** Re-run the async function manually (e.g. on a retry button). */
  retry: () => void;
}

/**
 * Runs an async function and tracks its loading / success / error state.
 *
 * @param fn   Async function to execute. Receives an AbortSignal so it can
 *             cancel in-flight requests when the component unmounts or the
 *             dependency list changes.
 * @param deps Dependency array — same semantics as useEffect.
 */
export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList,
): AsyncState<T> {
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);

  const run = useCallback(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError(null);

    fn(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setStatus("success");
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
        setError(message);
        setStatus("error");
      });

    return () => controller.abort();
  }, deps);

  useEffect(() => {
    return run();
  }, [run]);

  const retry = useCallback(() => {
    retryCount.current += 1;
    run();
  }, [run]);

  return { status, data, error, retry };
}
