import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import {
  EMPTY_BODY_HASH,
  getRequestPath,
  hashMultipartBody,
  hashRequestBody,
  isTimestampWithinSkew,
  verifyRequestSignature,
} from "../utils/requestSignature.js";

declare global {
  namespace Express {
    interface Request {
      /** Raw request body bytes captured by express.json verify (JSON routes). */
      rawBody?: Buffer;
    }
  }
}

function resolveBodyHash(req: Request): string {
  const contentType = req.headers["content-type"] ?? "";

  if (contentType.includes("multipart/form-data")) {
    const file = req.file as Express.Multer.File | undefined;
    return hashMultipartBody(req.body as Record<string, unknown>, file ? { buffer: file.buffer } : undefined);
  }

  if (req.rawBody !== undefined) {
    return hashRequestBody(req.rawBody);
  }

  if (req.method === "DELETE" || req.method === "GET") {
    return EMPTY_BODY_HASH;
  }

  return EMPTY_BODY_HASH;
}

/**
 * Optional HMAC-SHA256 request signature verification for publisher mutations.
 * When REQUIRE_REQUEST_SIGNATURE is false (default), this middleware is a no-op.
 *
 * Expects X-Timestamp (unix seconds) and X-Signature (hex HMAC) headers.
 * The API key (x-api-key) is the HMAC secret.
 */
export function requestSignatureAuth(req: Request, res: Response, next: NextFunction) {
  if (!config.REQUIRE_REQUEST_SIGNATURE) {
    next();
    return;
  }

  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey !== "string") {
    res.status(401).json({ error: "Missing x-api-key header" });
    return;
  }

  const timestampHeader = req.headers["x-timestamp"];
  const signatureHeader = req.headers["x-signature"];

  if (!timestampHeader || typeof timestampHeader !== "string") {
    res.status(401).json({ error: "Missing X-Timestamp header" });
    return;
  }
  if (!signatureHeader || typeof signatureHeader !== "string") {
    res.status(401).json({ error: "Missing X-Signature header" });
    return;
  }

  const timestampSeconds = Number(timestampHeader);
  if (!isTimestampWithinSkew(timestampSeconds, Date.now(), config.SIGNATURE_MAX_SKEW_MS)) {
    res.status(401).json({ error: "Request timestamp outside allowed window" });
    return;
  }

  const bodyHash = resolveBodyHash(req);
  const path = getRequestPath(req.originalUrl);
  const idempotencyHeader = req.headers["idempotency-key"];
  const idempotencyKey =
    typeof idempotencyHeader === "string" ? idempotencyHeader : undefined;

  const valid = verifyRequestSignature({
    secret: apiKey,
    method: req.method,
    path,
    timestamp: timestampHeader,
    bodyHash,
    idempotencyKey,
    signature: signatureHeader,
  });

  if (!valid) {
    res.status(401).json({ error: "Invalid request signature" });
    return;
  }

  next();
}
