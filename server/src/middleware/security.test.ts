import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { securityHeaders } from "./security.js";

function makeApp() {
  const app = express();
  app.use(securityHeaders());
  app.get("/json", (_req, res) => res.json({ ok: true }));
  app.get("/docs", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send("<!DOCTYPE html><html><body>docs</body></html>");
  });
  return app;
}

describe("securityHeaders", () => {
  it("sets the key security headers on JSON responses", async () => {
    const res = await request(makeApp()).get("/json");

    expect(res.status).toBe(200);
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["referrer-policy"]).toBeDefined();
    // Helmet sets HSTS so production deployments are forced onto HTTPS.
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
  });

  it("emits a CSP that lets the Swagger UI assets and inline bootstrap load", async () => {
    const res = await request(makeApp()).get("/docs");
    const csp = res.headers["content-security-policy"];

    expect(res.status).toBe(200);
    expect(csp).toContain("script-src");
    expect(csp).toContain("https://unpkg.com");
    expect(csp).toContain("'unsafe-inline'");
    // The UI fetches /openapi.json from the same origin.
    expect(csp).toContain("connect-src 'self'");
    // data: URIs are needed for the icons Swagger renders inline.
    expect(csp).toContain("img-src 'self' data: https://unpkg.com");
  });

  it("applies the same headers to every response", async () => {
    const app = makeApp();
    const [json, docs] = await Promise.all([request(app).get("/json"), request(app).get("/docs")]);

    expect(json.headers["x-content-type-options"]).toBe("nosniff");
    expect(docs.headers["x-content-type-options"]).toBe("nosniff");
  });
});
