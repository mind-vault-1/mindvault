import { Router, type IRouter, type Request, type Response } from "express";
import { config } from "../config.js";
import { metricsRegistry } from "../lib/metrics.js";

const metricsRouter: IRouter = Router();

metricsRouter.get("/metrics", async (req: Request, res: Response) => {
  if (!config.METRICS_TOKEN) {
    res.status(404).end();
    return;
  }

  const provided =
    req.headers.authorization?.replace(/^Bearer\s+/i, "") ??
    (req.query["token"] as string | undefined);

  if (provided !== config.METRICS_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const output = await metricsRegistry.metrics();
  res.set("Content-Type", metricsRegistry.contentType).send(output);
});

export default metricsRouter;
