import { Router, type Router as RouterType } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { payments, resources as resourcesTable } from "../db/schema.js";

const router: RouterType = Router();

// GET /payments/:id — get a payment receipt by id (public)
router.get("/payments/:id", async (req, res) => {
  const paymentId = req.params.id as string;

  const rows = await db
    .select({
      id: payments.id,
      resourceId: payments.resourceId,
      resourceTitle: resourcesTable.title,
      amount: payments.amount,
      currency: "USDC" as const,
      payerAddress: payments.payerAddress,
      recipientAddress: payments.recipientAddress,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .leftJoin(resourcesTable, eq(payments.resourceId, resourcesTable.id))
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Payment receipt not found" });
    return;
  }

  res.json(rows[0]);
});

// GET /payments — list payments (public, filtered by query param `payer`)
router.get("/payments", async (req, res) => {
  const payerAddress = req.query.payer as string | undefined;

  if (!payerAddress) {
    res.status(400).json({ error: "Query parameter 'payer' is required" });
    return;
  }

  const rows = await db
    .select({
      id: payments.id,
      resourceId: payments.resourceId,
      resourceTitle: resourcesTable.title,
      amount: payments.amount,
      currency: "USDC" as const,
      payerAddress: payments.payerAddress,
      recipientAddress: payments.recipientAddress,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .leftJoin(resourcesTable, eq(payments.resourceId, resourcesTable.id))
    .where(eq(payments.payerAddress, payerAddress))
    .orderBy(desc(payments.paidAt));

  res.json(rows);
});

export default router;
