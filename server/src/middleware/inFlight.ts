import type { NextFunction, Request, Response } from "express";
import { incInFlight, decInFlight } from "../lib/lifecycle.js";

// Counts in-flight requests so graceful shutdown (issue #112) can wait for them
// to drain. Mirrors requestContext's res.on("finish") lifecycle hook; "close"
// covers clients that disconnect before the response finishes.
export function inFlightMiddleware(_req: Request, res: Response, next: NextFunction): void {
  incInFlight();

  let settled = false;
  const release = () => {
    if (settled) return;
    settled = true;
    decInFlight();
  };

  res.on("finish", release);
  res.on("close", release);

  next();
}
