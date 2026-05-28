import type { Request, Response, NextFunction } from "express";
import {
  paymentMiddleware,
  x402ResourceServer,
} from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { resources } from "../db/schema.js";
import type { Network } from "@x402/core/types";
import type { RoutesConfig } from "@x402/core/server";
import { config } from "../config.js";
import { getResource } from "../services/registryClient.js";

const network = config.NETWORK as Network;

const facilitatorClient = new HTTPFacilitatorClient({
  url: config.FACILITATOR_URL,
});

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  network,
  new ExactStellarScheme()
);

// Cache middleware instances by resource ID to avoid re-creating on every request
const middlewareCache = new Map<
  string,
  { mw: ReturnType<typeof paymentMiddleware>; expiresAt: number }
>();
const CACHE_TTL_MS = 60_000; // 1 minute

export async function dynamicPaywall(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const resourceId = req.params.id as string;

  const resource = await db
    .select()
    .from(resources)
    .where(eq(resources.id, resourceId))
    .then((rows) => rows[0] ?? null);

  if (!resource) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }

  if (!resource.listed) {
    res.status(404).json({ error: "Resource not listed" });
    return;
  }

  // Attach resource to request for the delivery handler
  (req as any).resource = resource;

  // Try to get on-chain price if resource is registered
  let finalPrice = resource.price;
  if (resource.onchainStatus === "registered") {
    try {
      const onchainResource = await getResource(resourceId);
      if (onchainResource) {
        // Convert from stroops (7 decimals) to USDC string
        const onchainPriceUsdc = (Number(onchainResource.price) / 10_000_000).toString();
        finalPrice = onchainPriceUsdc;
      }
    } catch (error) {
      console.warn(`Failed to fetch on-chain price for ${resourceId}:`, error);
      // Fall back to database price
    }
  }

  // Check cache with final price as part of cache key
  const cacheKey = `${resourceId}:${finalPrice}`;
  const cached = middlewareCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.mw(req, res, next);
  }

  // Build route config for this specific resource
  const routePath = `GET /resources/${resourceId}`;
  const routes: RoutesConfig = {
    [routePath]: {
      accepts: {
        scheme: "exact" as const,
        network,
        payTo: resource.walletAddress,
        price: finalPrice,
      },
      description: resource.title,
    },
  };

  const mw = paymentMiddleware(routes, resourceServer);

  // Cache it with the final price key
  middlewareCache.set(cacheKey, {
    mw,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return mw(req, res, next);
}