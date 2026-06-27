import { Router, type Router as RouterType } from "express";
import { paymentMiddleware } from "@x402/express";
import type { RoutesConfig } from "@x402/core/server";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { resources, verifications } from "../db/schema.js";
import { checkOriginality } from "../services/verificationService.js";

import { config } from "../config.js";
import { network, sharedX402ResourceServer } from "../lib/x402.js";
import { verifyIpRateLimit, verifyWalletRateLimit } from "../middleware/rateLimiters.js";
import { validate } from "../middleware/validate.js";
import { verifyContentSchema } from "../schemas/requests.js";

const router: RouterType = Router();

const verifyRoutes: RoutesConfig = {
  "POST /verify-content": {
    accepts: {
      scheme: "exact" as const,
      network,
      payTo: config.PAY_TO,
      price: `$${config.VERIFICATION_PRICE}`,
    },
    description: "AI content originality verification",
  },
};

const verifyPaywall = paymentMiddleware(verifyRoutes, sharedX402ResourceServer);

// POST /verify-content — AI originality check (x402 paywalled)
router.post(
  "/verify-content",
  verifyIpRateLimit,
  verifyPaywall,
  verifyWalletRateLimit,
  validate(verifyContentSchema),
  async (req, res) => {
    const { content, resourceId } = req.body;

    const result = await checkOriginality(content, "text");

    // If a resourceId is provided, save the verification result
    if (resourceId) {
      const [verification] = await db
        .insert(verifications)
        .values({
          resourceId,
          isOriginal: result.isOriginal,
          confidence: result.confidence,
          flags: JSON.stringify(result.flags),
        })
        .returning();

      // Update resource status — listing is independent of on-chain registration
      await db
        .update(resources)
        .set({
          verificationStatus: result.isOriginal ? "verified" : "rejected",
          verificationId: verification.id,
          listed: result.isOriginal,
        })
        .where(eq(resources.id, resourceId));
    }

    res.json(result);
  },
);

// GET /agent/status — public agent stats
router.get("/agent/status", async (_req, res) => {
  // All verifications
  const allVerifications = await db
    .select({
      id: verifications.id,
      resourceId: verifications.resourceId,
      isOriginal: verifications.isOriginal,
      confidence: verifications.confidence,
      flags: verifications.flags,
      checkedAt: verifications.checkedAt,
    })
    .from(verifications)
    .orderBy(desc(verifications.checkedAt));

  // Get resource titles for recent activity
  const recentWithTitles = await Promise.all(
    allVerifications.slice(0, 10).map(async (v) => {
      const resource = await db
        .select({ title: resources.title })
        .from(resources)
        .where(eq(resources.id, v.resourceId))
        .then((rows) => rows[0]);

      return {
        id: v.id,
        resourceTitle: resource?.title || "Unknown",
        isOriginal: v.isOriginal,
        confidence: v.confidence,
        flags: v.flags ? JSON.parse(v.flags) : [],
        checkedAt: v.checkedAt,
      };
    }),
  );

  const totalVerifications = allVerifications.length;
  const verified = allVerifications.filter((v) => v.isOriginal).length;
  const rejected = allVerifications.filter((v) => !v.isOriginal).length;
  const pricePerVerification = parseFloat(config.VERIFICATION_PRICE);
  const totalEarned = totalVerifications * pricePerVerification;
  const avgConfidence =
    totalVerifications > 0
      ? allVerifications.reduce((sum, v) => sum + v.confidence, 0) / totalVerifications
      : 0;

  res.json({
    agent: {
      name: "MindVault Verification Agent",
      walletAddress: config.PAY_TO,
      network: config.NETWORK,
      endpoint: `${config.BASE_URL}/verify-content`,
      pricePerVerification: config.VERIFICATION_PRICE,
      currency: "USDC",
      status: "active",
    },
    stats: {
      totalVerifications,
      verified,
      rejected,
      totalEarned: totalEarned.toFixed(4),
      avgConfidence: avgConfidence.toFixed(2),
    },
    recentActivity: recentWithTitles,
  });
});

export default router;
