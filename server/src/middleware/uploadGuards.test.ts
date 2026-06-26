import { describe, it, expect, beforeAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// uploadGuards imports config; mock it so the test doesn't need a full env.
vi.mock("../config.js", () => ({
  config: {
    MAX_FILE_SIZE_MB: 1,
    ALLOWED_UPLOAD_MIME_TYPES: "application/pdf,image/png,text/plain",
  },
}));

import { singleFileUpload, validateUploadContentType } from "./uploadGuards.js";

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function buildApp(): Express {
  const app = express();
  app.post("/upload", singleFileUpload("file"), validateUploadContentType, (req, res) => {
    res.status(201).json({ ok: true, mimetype: req.file?.mimetype ?? null });
  });
  return app;
}

describe("upload guards middleware", () => {
  let app: Express;
  beforeAll(() => {
    app = buildApp();
  });

  it("accepts an allow-listed file whose bytes match", async () => {
    const res = await request(app)
      .post("/upload")
      .attach("file", PDF, { filename: "doc.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it("rejects a disallowed content type with 415", async () => {
    const res = await request(app)
      .post("/upload")
      .attach("file", Buffer.from([0x50, 0x4b, 0x03, 0x04]), {
        filename: "a.zip",
        contentType: "application/zip",
      });
    expect(res.status).toBe(415);
  });

  it("rejects when declared type does not match detected bytes (415)", async () => {
    const res = await request(app)
      .post("/upload")
      .attach("file", PNG, { filename: "fake.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(415);
    expect(res.body.error).toMatch(/does not match/i);
  });

  it("rejects oversized uploads with 413", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024, 0x41); // 2MB > 1MB limit
    const res = await request(app)
      .post("/upload")
      .attach("file", big, { filename: "big.txt", contentType: "text/plain" });
    expect(res.status).toBe(413);
  });

  it("passes through requests with no file", async () => {
    const res = await request(app).post("/upload").send();
    expect(res.status).toBe(201);
    expect(res.body.mimetype).toBeNull();
  });
});
