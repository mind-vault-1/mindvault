import type { Server } from "node:http";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { rootLogger } from "./lib/logger.js";
import { beginShutdown, whenDrained, inFlightCount } from "./lib/lifecycle.js";
import { pgClient } from "./db/client.js";

const app = createApp();

const server: Server = app.listen(config.PORT, () => {
  rootLogger.info(
    {
      event: "server_start",
      port: config.PORT,
      network: config.NETWORK,
      healthUrl: `http://localhost:${config.PORT}/health`,
    },
    "MindVault server started",
  );
});

let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  // Stop passing readiness checks so load balancers drain us before we close.
  beginShutdown();
  rootLogger.info(
    { event: "shutdown_start", signal, inFlight: inFlightCount() },
    "graceful shutdown started",
  );

  // Stop accepting new connections; existing ones keep being served.
  server.close();

  // Wait for in-flight requests to finish, bounded by the configured grace period.
  let timedOut = false;
  let drainTimer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<void>((resolve) => {
    drainTimer = setTimeout(() => {
      timedOut = true;
      resolve();
    }, config.GRACEFUL_SHUTDOWN_TIMEOUT_MS);
  });

  await Promise.race([whenDrained(), deadline]);
  clearTimeout(drainTimer!);

  if (timedOut && inFlightCount() > 0) {
    rootLogger.warn(
      { event: "shutdown_drain_timeout", inFlight: inFlightCount() },
      "drain timed out with requests still in flight; forcing close",
    );
  }

  try {
    await pgClient.end({ timeout: 5 });
    const forced = timedOut && inFlightCount() > 0;
    rootLogger.info({ event: "shutdown_complete", signal, forced }, "graceful shutdown complete");
    process.exit(forced ? 1 : 0);
  } catch (err) {
    rootLogger.error({ event: "shutdown_error", err }, "error closing database pool");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
