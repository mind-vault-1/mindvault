import type { Request, Response, NextFunction } from "express";
import { httpRequestDuration } from "../lib/metrics.js";

export function requestDurationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = httpRequestDuration.startTimer();
  res.on("finish", () => {
    // Use matched route pattern when available (e.g. /resources/:id); fall back to path.
    const route = (req.route?.path as string | undefined) ?? req.path;
    end({ method: req.method, route, status_code: String(res.statusCode) });
  });
  next();
}
