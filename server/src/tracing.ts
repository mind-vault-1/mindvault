/**
 * OpenTelemetry distributed tracing (#307).
 *
 * Must be the FIRST thing the process loads — auto-instrumentation patches
 * `node:http`, `undici` (the global `fetch`, used by the Stellar SDK and
 * the x402 facilitator client), and Express, and that only works if it
 * runs before those modules are first imported. Loaded via `--import`
 * (see package.json's `start`/`dev` scripts), not a regular import.
 *
 * No-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set: nothing is started,
 * nothing is exported, zero overhead locally.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (otlpEndpoint) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "mindvault-server",
    }),
    traceExporter: new OTLPTraceExporter({ url: otlpEndpoint }),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      // Node's global `fetch` runs on undici, not node:http — required for
      // outbound Soroban RPC and x402 facilitator calls to carry trace context.
      new UndiciInstrumentation(),
    ],
  });

  sdk.start();

  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      sdk.shutdown().catch(() => undefined);
    });
  }
}
