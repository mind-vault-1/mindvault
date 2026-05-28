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
import {
  getOnChainPrice,
  normalizeUsdcPrice,
  OnChainLookupError,
} from "../lib/stellarRegistry.js";

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

  // Validate the DB price against the on-chain registry before serving a 402.
  // If they disagree we refuse the request rather than charge the wrong amount.
  // TODO: cover this path with unit tests once a test runner is configured.
  let onChainPrice: string;
  let onChainCreator: string;
  try {
    const onChain = await getOnChainPrice(resourceId);
    onChainPrice = onChain.price;
    onChainCreator = onChain.creator;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cause =
      err instanceof OnChainLookupError && err.cause instanceof Error
        ? err.cause.message
        : undefined;
    console.error("[paywall] on-chain price lookup failed", {
      resourceId,
      error: message,
      cause,
      timestamp: new Date().toISOString(),
    });
    res.status(503).json({
      error: "chain_unavailable",
      message: "Unable to verify resource price. Please try again later.",
      resourceId,
    });
    return;
  }

  const dbPriceNormalized = normalizeUsdcPrice(resource.price);
  if (dbPriceNormalized !== onChainPrice) {
    const timestamp = new Date().toISOString();
    console.warn(
      `Price mismatch detected for resource ${resourceId}: DB=$${resource.price} chain=$${onChainPrice}`,
      {
        resourceId,
        dbPrice: resource.price,
        chainPrice: onChainPrice,
        publisherWallet: resource.walletAddress,
        onChainCreator,
        timestamp,
      }
    );
    res.status(409).json({
      error: "price_mismatch",
      message:
        "Resource price is temporarily unavailable due to a configuration issue. Please try again later.",
      resourceId,
    });
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