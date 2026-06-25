import { Router, type Router as RouterType } from "express";
import { probeDatabase, probeSorobanRpc } from "../lib/probes.js";
import { overallReadinessStatus } from "../lib/readiness.js";
import { isAccepting } from "../lib/lifecycle.js";

const router: RouterType = Router();

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "mindvault",
    timestamp: new Date().toISOString(),
  });
});

router.get("/health/ready", async (_req, res) => {
  // During graceful shutdown, fail readiness immediately so load balancers stop
  // routing new traffic while in-flight requests drain.
  if (!isAccepting()) {
    res.status(503).json({
      status: "shutting_down",
      service: "mindvault",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const [database, sorobanRpc] = await Promise.all([probeDatabase(), probeSorobanRpc()]);

  const checks = { database, sorobanRpc };
  const status = overallReadinessStatus(checks);
  const httpStatus = status === "ok" ? 200 : 503;

  res.status(httpStatus).json({
    status,
    service: "mindvault",
    checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;
