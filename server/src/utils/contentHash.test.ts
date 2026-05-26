import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFileContentHash, createLinkContentHash, normalizeExternalUrl } from "./contentHash.js";

describe("createFileContentHash", () => {
  it("returns a stable SHA-256 hash for identical file bytes and title", () => {
    const first = createFileContentHash({
      title: "Quarterly Data",
      bytes: Buffer.from("hello world"),
    });
    const second = createFileContentHash({
      title: "Quarterly Data",
      bytes: Buffer.from("hello world"),
    });

    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(first, second);
  });

  it("changes when file bytes change", () => {
    const first = createFileContentHash({ title: "Quarterly Data", bytes: Buffer.from("hello world") });
    const second = createFileContentHash({ title: "Quarterly Data", bytes: Buffer.from("hello world!") });

    assert.notEqual(first, second);
  });

  it("normalizes title whitespace", () => {
    const first = createFileContentHash({ title: "Quarterly Data", bytes: Buffer.from("hello world") });
    const second = createFileContentHash({ title: "  Quarterly   Data  ", bytes: Buffer.from("hello world") });

    assert.equal(first, second);
  });
});

describe("createLinkContentHash", () => {
  it("returns a stable SHA-256 hash for identical normalized links and title", () => {
    const first = createLinkContentHash({
      title: "API Docs",
      externalUrl: "HTTPS://Example.com/docs?b=2&a=1#intro",
    });
    const second = createLinkContentHash({
      title: "API Docs",
      externalUrl: "https://example.com/docs?a=1&b=2",
    });

    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(first, second);
  });

  it("changes when normalized URL changes", () => {
    const first = createLinkContentHash({ title: "API Docs", externalUrl: "https://example.com/docs" });
    const second = createLinkContentHash({ title: "API Docs", externalUrl: "https://example.com/api" });

    assert.notEqual(first, second);
  });
});

describe("normalizeExternalUrl", () => {
  it("normalizes protocol, host, fragments, default ports, and query param order", () => {
    assert.equal(
      normalizeExternalUrl("HTTPS://Example.com:443/docs?b=2&a=1#intro"),
      "https://example.com/docs?a=1&b=2"
    );
  });
});
