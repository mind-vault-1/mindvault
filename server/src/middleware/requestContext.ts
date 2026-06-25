import { createId } from "@paralleldrive/cuid2";
import type { NextFunction, Request, Response } from "express";
import { getLogger, runWithRequestContext } from "../lib/logger.js";

const REQUEST_ID_HEADER = "x-request-id";

function readIncomingRequestId(req: Request): string | undefined {
  const raw = req.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = readIncomingRequestId(req) ?? createId();
  res.setHeader(REQUEST_ID_HEADER, requestId);

  runWithRequestContext(requestId, () => {
    const log = getLogger();
    const start = Date.now();

    res.on("finish", () => {
      log.info(
        {
          event: "http_request",
          method: req.method,
          path: req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
        },
        "request completed",
      );
    });

    next();
  });
}
