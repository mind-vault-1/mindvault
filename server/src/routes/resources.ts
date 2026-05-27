import { Router, type Router as RouterType } from "express";
import multer from "multer";
import { z } from "zod/v4";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { dynamicPaywall } from "../middleware/dynamicPaywall.js";
import {
  createFileResource,
  createLinkResource,
  listCatalog,
  getResourceMeta,
  getVerificationDetails,
  delistResource,
  getResourceById,
} from "../services/resourceService.js";
import { downloadFile } from "../storage/supabaseStorage.js";
import { db } from "../db/client.js";
import { payments, resources } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import {
  registryClient,
  NETWORK_PASSPHRASE,
  registryKeypair,
} from "../services/registryClient.js";

const router: RouterType = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024 },
});

const linkSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  price: z.string().min(1),
  walletAddress: z.string().optional(),
  externalUrl: z.url(),
});

// POST /resources — publish a resource (authenticated)
router.post("/resources", apiKeyAuth, upload.single("file"), async (req, res) => {
  const publisher = req.publisher!;

  // File upload
  if (req.file) {
    const { title, description, price, walletAddress } = req.body;

    if (!title || !price) {
      res.status(400).json({ error: "title and price are required" });
      return;
    }

    const resource = await createFileResource({
      publisherId: publisher.id,
      title,
      description,
      price,
      walletAddress: walletAddress || publisher.walletAddress,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    res.status(201).json({
      ...resource,
      accessUrl: `${config.BASE_URL}/resources/${resource.id}`,
    });
    return;
  }

  // Link resource
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }

  const resource = await createLinkResource({
    publisherId: publisher.id,
    title: parsed.data.title,
    description: parsed.data.description,
    price: parsed.data.price,
    walletAddress: parsed.data.walletAddress || publisher.walletAddress,
    externalUrl: parsed.data.externalUrl,
  });

  res.status(201).json({
    ...resource,
    accessUrl: `${config.BASE_URL}/resources/${resource.id}`,
  });
});

// GET /resources — browse catalog (public)
router.get("/resources", async (_req, res) => {
  const catalog = await listCatalog();
  res.json(
    catalog.map((r) => ({
      ...r,
      accessUrl: `${config.BASE_URL}/resources/${r.id}`,
    }))
  );
});

// GET /resources/:id/meta — resource preview (public)
router.get("/resources/:id/meta", async (req, res) => {
  const meta = await getResourceMeta(req.params.id as string);
  if (!meta) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  res.json({
    ...meta,
    accessUrl: `${config.BASE_URL}/resources/${meta.id}`,
  });
});

// GET /resources/:id/verification — verification status and details (public)
router.get("/resources/:id/verification", async (req, res) => {
  const details = await getVerificationDetails(req.params.id as string);
  if (!details) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  res.json(details);
});

// GET /resources/:id — access resource (x402 paywalled)
router.get("/resources/:id", dynamicPaywall, async (req, res) => {
  const resource = (req as any).resource;

  // Record payment
  let payerAddress = "unknown";
  try {
    const paymentHeader = req.headers["x-payment"] as string;
    if (paymentHeader) {
      const decoded = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString()
      );
      payerAddress = decoded?.payload?.authorization?.address || decoded?.clientAddress || "unknown";
    }
  } catch {
    // Best effort — don't fail delivery if we can't parse
  }

  const [payment] = await db
    .insert(payments)
    .values({
      resourceId: resource.id,
      payerAddress,
      recipientAddress: resource.walletAddress,
      amount: resource.price,
    })
    .returning();

  if (resource.resourceType === "link") {
    res.json({
      url: resource.externalUrl,
      receipt: {
        paymentId: payment.id,
        amount: payment.amount,
        currency: "USDC",
        paidTo: payment.recipientAddress,
        paidAt: payment.paidAt,
      },
    });
    return;
  }

  // Stream file from Supabase Storage
  if (!resource.storagePath) {
    res.status(500).json({ error: "Resource file not found" });
    return;
  }

  // Add receipt info in headers for file downloads
  res.setHeader("X-Payment-Id", payment.id);
  res.setHeader("X-Payment-Amount", `${payment.amount} USDC`);
  res.setHeader("X-Payment-Recipient", payment.recipientAddress);

  const { buffer, mimeType } = await downloadFile(resource.storagePath);
  res.setHeader("Content-Type", mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${resource.storagePath.split("/").pop()}"`
  );
  res.send(buffer);
});

// DELETE /resources/:id — delist a resource (authenticated, owner only)
router.delete("/resources/:id", apiKeyAuth, async (req, res) => {
  const resource = await delistResource(req.params.id as string, req.publisher!.id);
  if (!resource) {
    res.status(404).json({ error: "Resource not found or not owned by you" });
    return;
  }
  res.json({ message: "Resource delisted", id: resource.id });
});

// POST /resources/:id/price/prepare — build unsigned set_price tx (owner only)
// Returns the XDR of an unsigned transaction the owner must sign client-side.
router.post("/resources/:id/price/prepare", apiKeyAuth, async (req, res) => {
  const publisher = req.publisher!;
  const resourceId = req.params.id as string;

  const resource = await getResourceById(resourceId);
  if (!resource) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  if (resource.publisherId !== publisher.id) {
    res.status(403).json({ error: "Forbidden: you do not own this resource" });
    return;
  }

  const parsed = z.object({ price: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }

  // Convert USDC string (e.g. "0.50") to stroops (i128, 7 decimals)
  const priceStroops = BigInt(Math.round(parseFloat(parsed.data.price) * 1_000_000_0));

  const tx = await (registryClient as any).set_price(
    { id: resourceId, new_price: priceStroops },
    { simulate: false }
  );

  const unsignedXdr = tx.toXDR();
  res.json({ unsignedXdr, networkPassphrase: NETWORK_PASSPHRASE });
});

// POST /resources/:id/price — submit signed set_price tx and sync DB price
router.post("/resources/:id/price", apiKeyAuth, async (req, res) => {
  const publisher = req.publisher!;
  const resourceId = req.params.id as string;

  const resource = await getResourceById(resourceId);
  if (!resource) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  if (resource.publisherId !== publisher.id) {
    res.status(403).json({ error: "Forbidden: you do not own this resource" });
    return;
  }

  const parsed = z
    .object({ signedXdr: z.string().min(1), price: z.string().min(1) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }

  // Submit the signed transaction via the registry client's underlying RPC server
  const { rpc: StellarRpc, Transaction: StellarTransaction } = await import(
    "@stellar/stellar-sdk"
  );
  const rpcServer = new StellarRpc.Server(config.SOROBAN_RPC_URL);
  const signedTx = new StellarTransaction(
    parsed.data.signedXdr,
    NETWORK_PASSPHRASE
  );
  const sendResult = await rpcServer.sendTransaction(signedTx);

  if (sendResult.status !== "PENDING") {
    res.status(502).json({ error: "Transaction rejected", detail: sendResult.status });
    return;
  }

  // Poll for confirmation
  const txHash = sendResult.hash;
  let confirmed = false;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const txResult = await rpcServer.getTransaction(txHash);
    if (txResult.status === StellarRpc.Api.GetTransactionStatus.SUCCESS) {
      confirmed = true;
      break;
    }
    if (txResult.status === StellarRpc.Api.GetTransactionStatus.FAILED) {
      res.status(502).json({ error: "Transaction failed on-chain" });
      return;
    }
  }
  if (!confirmed) {
    res.status(504).json({ error: "Transaction confirmation timed out" });
    return;
  }

  // Sync the DB price to match the on-chain value
  const [updated] = await db
    .update(resources)
    .set({ price: parsed.data.price })
    .where(eq(resources.id, resourceId))
    .returning();

  res.json({ id: updated.id, price: updated.price, status: "confirmed" });
});

export default router;
