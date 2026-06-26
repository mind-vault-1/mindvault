import { describe, it, expect } from "vitest";
import {
  detectContentType,
  normalizeMimeType,
  parseAllowedMimeTypes,
  validateUpload,
} from "./uploadValidation.js";

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = Buffer.concat([
  Buffer.from([0x52, 0x49, 0x46, 0x46]),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from([0x57, 0x45, 0x42, 0x50]),
]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const TEXT = Buffer.from("just some plain text", "utf8");

describe("normalizeMimeType", () => {
  it("lowercases and strips parameters", () => {
    expect(normalizeMimeType("Application/PDF; charset=binary")).toBe("application/pdf");
  });
  it("maps common aliases", () => {
    expect(normalizeMimeType("image/jpg")).toBe("image/jpeg");
    expect(normalizeMimeType("audio/mp3")).toBe("audio/mpeg");
  });
});

describe("parseAllowedMimeTypes", () => {
  it("parses and normalizes a CSV allowlist", () => {
    const set = parseAllowedMimeTypes("application/pdf, image/jpg ,text/plain");
    expect(set.has("application/pdf")).toBe(true);
    expect(set.has("image/jpeg")).toBe(true); // normalized from image/jpg
    expect(set.has("text/plain")).toBe(true);
  });
});

describe("detectContentType", () => {
  it.each([
    ["pdf", PDF, "application/pdf"],
    ["png", PNG, "image/png"],
    ["jpeg", JPEG, "image/jpeg"],
    ["gif", GIF, "image/gif"],
    ["webp", WEBP, "image/webp"],
    ["zip", ZIP, "application/zip"],
  ])("detects %s by magic bytes", (_name, buf, expected) => {
    expect(detectContentType(buf as Buffer)).toBe(expected);
  });

  it("returns null for plain text / unknown content", () => {
    expect(detectContentType(TEXT)).toBeNull();
    expect(detectContentType(Buffer.alloc(0))).toBeNull();
  });
});

describe("validateUpload", () => {
  const allowed = parseAllowedMimeTypes("application/pdf,image/png,text/plain");

  it("accepts an allow-listed type whose bytes match", () => {
    expect(validateUpload(PDF, "application/pdf", allowed)).toEqual({
      ok: true,
      contentType: "application/pdf",
    });
  });

  it("accepts text by declaration (no magic bytes)", () => {
    expect(validateUpload(TEXT, "text/plain", allowed)).toEqual({
      ok: true,
      contentType: "text/plain",
    });
  });

  it("rejects a non-allow-listed type with 415", () => {
    const result = validateUpload(ZIP, "application/zip", allowed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });

  it("rejects when declared binary type does not match detected bytes", () => {
    const result = validateUpload(PNG, "application/pdf", allowed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(415);
      expect(result.error).toMatch(/does not match/i);
    }
  });

  it("rejects a binary masquerading as text", () => {
    const result = validateUpload(PDF, "text/plain", allowed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });

  it("rejects a declared detectable type with no matching signature", () => {
    const result = validateUpload(TEXT, "image/png", allowed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });

  it("rejects a missing content type", () => {
    const result = validateUpload(PDF, "", allowed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });
});
