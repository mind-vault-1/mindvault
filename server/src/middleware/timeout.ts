import type { NextFunction, Request, Response } from "express";
import { getLogger } from "../lib/logger.js";

// Per-request timeout (issue #113). When a slow upstream (RPC, facilitator,
// storage) keeps a request open past the limit, respond 503 instead of letting
// the connection hang. The timer is cleared once the response finishes (or the
// client disconnects) so completed requests never trip it.
export function requestTimeout(ms: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      // Headers may already be on the wire (e.g. a streamed download in
      // progress) — don't try to rewrite the response in that case.
      if (res.headersSent) return;

      getLogger().warn(
        {
          event: "request_timeout",
          method: req.method,
          path: req.originalUrl || req.url,
          timeoutMs: ms,
        },
        "request timed out",
      );

      res.setHeader("Retry-After", String(Math.ceil(ms / 1000)));
      res.status(503).json({ error: "Request timeout" });
    }, ms);

    const clear = () => clearTimeout(timer);
    res.on("finish", clear);
    res.on("close", clear);

    next();
  };
}
