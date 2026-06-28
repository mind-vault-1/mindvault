import helmet from "helmet";
import type { RequestHandler } from "express";

// Swagger UI (mounted at /docs) is loaded from the unpkg CDN and relies on an
// inline bootstrap script plus the styles it injects at runtime. The default
// Helmet CSP blocks all of that, so we widen the relevant directives just
// enough for the docs page while keeping the rest of the policy locked down.
const SWAGGER_CDN = "https://unpkg.com";

// Security headers (issue #279). Helmet sets sensible defaults for HSTS,
// X-Content-Type-Options, X-Frame-Options, Referrer-Policy, etc. We only
// override the Content-Security-Policy so that the JSON API stays strict while
// the Swagger UI at /docs continues to load.
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        // The Swagger bundle comes from unpkg; its init block is inline.
        scriptSrc: ["'self'", "'unsafe-inline'", SWAGGER_CDN],
        // Swagger injects inline styles and pulls its stylesheet from unpkg.
        styleSrc: ["'self'", "'unsafe-inline'", SWAGGER_CDN],
        // Swagger UI renders icons as data: URIs.
        imgSrc: ["'self'", "data:", SWAGGER_CDN],
        // The UI fetches /openapi.json from the same origin.
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:", SWAGGER_CDN],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    // The API serves JSON and downloadable resources to third-party clients;
    // a strict same-origin embedder policy would break those cross-origin reads.
    crossOriginEmbedderPolicy: false,
    // Allow Swagger assets and resource downloads to be consumed cross-origin.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
}
