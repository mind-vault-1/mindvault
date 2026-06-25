import { Router, type Router as RouterType } from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { validate } from "../middleware/validate.js";
import { publisherRegisterSchema } from "../schemas/requests.js";
import { registerPublisher, getPublisherResources } from "../services/publisherService.js";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { publishers, resources, payments } from "../db/schema.js";
import { config } from "../config.js";

const router: RouterType = Router();

// POST /publishers — register a new publisher (public)
router.post("/publishers", validate(publisherRegisterSchema), async (req, res) => {
  try {
    const { publisher, apiKey } = await registerPublisher(req.body);
    res.status(201).json({
      id: publisher.id,
      name: publisher.name,
      email: publisher.email,
      walletAddress: publisher.walletAddress,
      apiKey, // shown once — store it securely
      createdAt: publisher.createdAt,
    });
  } catch (err: any) {
    if (err.message?.includes("unique")) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    throw err;
  }
});

// GET /publishers/wallet/:address — look up publisher by wallet (public)
router.get("/publishers/wallet/:address", async (req, res) => {
  const address = req.params.address as string;
  const publisher = await db
    .select({
      id: publishers.id,
      name: publishers.name,
      email: publishers.email,
      walletAddress: publishers.walletAddress,
      createdAt: publishers.createdAt,
    })
    .from(publishers)
    .where(eq(publishers.walletAddress, address))
    .then((rows) => rows[0] ?? null);

  if (!publisher) {
    res.status(404).json({ error: "No publisher found for this wallet" });
    return;
  }

  res.json(publisher);
});

// GET /publishers/me — own profile (authenticated)
router.get("/publishers/me", apiKeyAuth, async (req, res) => {
  const pub = req.publisher!;
  res.json({
    id: pub.id,
    name: pub.name,
    email: pub.email,
    walletAddress: pub.walletAddress,
    createdAt: pub.createdAt,
  });
});

// GET /publishers/me/resources — own resources (authenticated)
router.get("/publishers/me/resources", apiKeyAuth, async (req, res) => {
  const resources = await getPublisherResources(req.publisher!.id);
  res.json(resources);
});

// GET /publishers/me/analytics — earnings and stats (authenticated)
router.get("/publishers/me/analytics", apiKeyAuth, async (req, res) => {
  const publisherId = req.publisher!.id;

  // Get all resources for this publisher
  const pubResources = await db
    .select({
      id: resources.id,
      title: resources.title,
      price: resources.price,
      verificationStatus: resources.verificationStatus,
      listed: resources.listed,
      createdAt: resources.createdAt,
    })
    .from(resources)
    .where(eq(resources.publisherId, publisherId));

  const resourceIds = pubResources.map((r) => r.id);

  // Get all payments for these resources
  let allPayments: any[] = [];
  if (resourceIds.length > 0) {
    allPayments = await db
      .select({
        id: payments.id,
        resourceId: payments.resourceId,
        payerAddress: payments.payerAddress,
        amount: payments.amount,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .where(inArray(payments.resourceId, resourceIds));
  }

  // Compute per-resource stats
  const resourceStats = pubResources.map((r) => {
    const resourcePayments = allPayments.filter((p) => p.resourceId === r.id);
    const totalEarned = resourcePayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    return {
      id: r.id,
      title: r.title,
      price: r.price,
      accessUrl: `${config.BASE_URL}/resources/${r.id}`,
      verificationStatus: r.verificationStatus,
      listed: r.listed,
      createdAt: r.createdAt,
      totalSales: resourcePayments.length,
      totalEarned: totalEarned.toFixed(4),
      recentPayments: resourcePayments.slice(0, 5).map((p) => ({
        payerAddress: p.payerAddress,
        amount: p.amount,
        paidAt: p.paidAt,
      })),
    };
  });

  // Summary
  const totalEarned = allPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const totalSales = allPayments.length;
  const totalResources = pubResources.length;
  const listedResources = pubResources.filter((r) => r.listed).length;
  const verifiedResources = pubResources.filter((r) => r.verificationStatus === "verified").length;
  const rejectedResources = pubResources.filter((r) => r.verificationStatus === "rejected").length;
  const pendingResources = pubResources.filter((r) => r.verificationStatus === "pending").length;

  res.json({
    summary: {
      totalEarned: totalEarned.toFixed(4),
      currency: "USDC",
      totalSales,
      totalResources,
      listedResources,
      verification: {
        verified: verifiedResources,
        rejected: rejectedResources,
        pending: pendingResources,
      },
    },
    resources: resourceStats,
  });
});

// GET /publishers/leaderboard — public creator leaderboard
router.get("/publishers/leaderboard", async (_req, res) => {
  // Get all publishers with their resource and payment stats
  const allPublishers = await db.select().from(publishers);
  const allResources = await db
    .select({
      id: resources.id,
      publisherId: resources.publisherId,
      price: resources.price,
      listed: resources.listed,
      verificationStatus: resources.verificationStatus,
    })
    .from(resources);
  const allPayments = await db
    .select({
      resourceId: payments.resourceId,
      amount: payments.amount,
      paidAt: payments.paidAt,
    })
    .from(payments);

  const leaderboard = allPublishers.map((pub) => {
    const pubResources = allResources.filter((r) => r.publisherId === pub.id);
    const pubResourceIds = pubResources.map((r) => r.id);
    const pubPayments = allPayments.filter((p) => pubResourceIds.includes(p.resourceId));

    const totalEarned = pubPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    return {
      id: pub.id,
      name: pub.name,
      walletAddress: pub.walletAddress,
      joinedAt: pub.createdAt,
      totalResources: pubResources.length,
      listedResources: pubResources.filter((r) => r.listed).length,
      verifiedResources: pubResources.filter((r) => r.verificationStatus === "verified").length,
      totalSales: pubPayments.length,
      totalEarned: totalEarned.toFixed(4),
    };
  });

  // Sort by earnings descending
  leaderboard.sort((a, b) => parseFloat(b.totalEarned) - parseFloat(a.totalEarned));

  res.json(leaderboard);
});

export default router;
