import { Router, type Router as RouterType } from "express";
import { resourceCount } from "../services/registryClient.js";

const router: RouterType = Router();

// GET /registry/status — on-chain registry statistics
router.get("/registry/status", async (_req, res) => {
  const count = await resourceCount();
  res.json({ resourceCount: count });
});

export default router;
