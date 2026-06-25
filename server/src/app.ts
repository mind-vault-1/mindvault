import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { config } from "./config.js";
import { corsMiddleware } from "./cors.js";
import { getLogger } from "./lib/logger.js";
import { requestContextMiddleware } from "./middleware/requestContext.js";
import { inFlightMiddleware } from "./middleware/inFlight.js";
import { requestTimeout } from "./middleware/timeout.js";
import healthRouter from "./routes/health.js";
import publisherRouter from "./routes/publishers.js";
import registryRouter from "./routes/registry.js";
import resourceRouter from "./routes/resources.js";
import verifyRouter from "./routes/verify.js";
import docsRouter from "./routes/docs.js";

export function createApp(): Express {
  const app = express();

  app.use(corsMiddleware());
  app.use(requestContextMiddleware);
  app.use(inFlightMiddleware);
  app.use(express.json());
  app.use(requestTimeout(config.REQUEST_TIMEOUT_MS));

  // Routes
  app.use(healthRouter);
  app.use(publisherRouter);
  app.use(registryRouter);
  app.use(resourceRouter);
  app.use(verifyRouter);

  // OpenAPI spec + Swagger UI (all envs; UI is CDN-based, no extra package needed)
  app.use(docsRouter);

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    getLogger().error({ err, event: "unhandled_error" }, "unhandled error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
