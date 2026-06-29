import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type Logger } from "pino";
import { trace } from "@opentelemetry/api";

export const rootLogger: Logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Stamps the active OTel trace id onto every log line (#307) so logs and
  // traces can be correlated. A no-op object when tracing isn't enabled —
  // getActiveSpan() returns undefined and traceId is simply omitted.
  mixin() {
    const traceId = trace.getActiveSpan()?.spanContext().traceId;
    return traceId ? { traceId } : {};
  },
});

type RequestContext = {
  requestId: string;
  log: Logger;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

/** Request-scoped logger when inside request middleware; otherwise the root logger. */
export function getLogger(): Logger {
  return requestContext.getStore()?.log ?? rootLogger;
}

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

export function runWithRequestContext<T>(requestId: string, fn: () => T): T {
  const log = rootLogger.child({ requestId });
  return requestContext.run({ requestId, log }, fn);
}
