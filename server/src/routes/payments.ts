import { Router, type Router as RouterType } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { payments } from "../db/schema.js";

const router: RouterType = Router();

// GET /payments/:id/receipt — payment receipt endpoint
router.get("/payments/:id/receipt", async (req, res) => {
  const id = req.params.id as string;
  const payment = await db
    .select({
      id: payments.id,
      resourceId: payments.resourceId,
      amount: payments.amount,
      payerAddress: payments.payerAddress,
      recipientAddress: payments.recipientAddress,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(eq(payments.id, id))
    .then((rows) => rows[0] ?? null);

  if (!payment) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }

  res.json(payment);
});

// GET /buyers/:address/payments — buyer payment history
router.get("/buyers/:address/payments", async (req, res) => {
  const address = req.params.address as string;
  const buyerPayments = await db
    .select({
      id: payments.id,
      resourceId: payments.resourceId,
      amount: payments.amount,
      payerAddress: payments.payerAddress,
      recipientAddress: payments.recipientAddress,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(eq(payments.payerAddress, address))
    .orderBy(desc(payments.paidAt));

  res.json(buyerPayments);
});

export default router;
