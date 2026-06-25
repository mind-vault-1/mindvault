import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { publishers } from "../db/schema.js";
import { hashApiKey } from "../utils/crypto.js";

declare global {
  namespace Express {
    interface Request {
      publisher?: typeof publishers.$inferSelect;
    }
  }
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-api-key"];

  if (!key || typeof key !== "string") {
    res.status(401).json({ error: "Missing x-api-key header" });
    return;
  }

  const hash = hashApiKey(key);
  const publisher = await db
    .select()
    .from(publishers)
    .where(eq(publishers.apiKeyHash, hash))
    .then((rows) => rows[0]);

  if (!publisher) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  req.publisher = publisher;
  next();
}
