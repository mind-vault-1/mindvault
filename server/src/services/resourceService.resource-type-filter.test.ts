import { describe, it, expect, beforeEach, vi } from "vitest";

// db rows the mock serves; tests mutate before each scenario.
let currentRows: unknown[] = [];

const builder = {
  from: () => builder,
  innerJoin: () => builder,
  where: () => builder,
  orderBy: () => builder,
  then: (resolve: any) => resolve(currentRows),
};

vi.mock("../db/client.js", () => ({
  db: { select: () => builder },
}));

vi.mock("../storage/supabaseStorage.js", () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("../config.js", () => ({
  config: { CATALOG_CACHE_TTL_MS: 60_000, CATALOG_CACHE_MAX_KEYS: 200 },
}));

import { listCatalog, __resetCatalogCache } from "./resourceService.js";

function row(id: string, resourceType: "file" | "link") {
  return {
    id,
    title: id,
    description: "desc",
    price: "1.00",
    resourceType,
    mimeType: null,
    verificationStatus: "verified",
    publisherName: "pub",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

describe("listCatalog resourceType filter (#161)", () => {
  beforeEach(() => {
    __resetCatalogCache();
    currentRows = [row("link-1", "link"), row("file-1", "file"), row("link-2", "link")];
  });

  it("returns all resources when resourceType is omitted", async () => {
    const result = await listCatalog();
    expect(result.map((r) => r.id).sort()).toEqual(["file-1", "link-1", "link-2"]);
  });

  it("returns only link resources for resourceType=link", async () => {
    const result = await listCatalog({ resourceType: "link" });
    expect(result.map((r) => r.id).sort()).toEqual(["link-1", "link-2"]);
    expect(result.every((r) => r.resourceType === "link")).toBe(true);
  });

  it("returns only file resources for resourceType=file", async () => {
    const result = await listCatalog({ resourceType: "file" });
    expect(result.map((r) => r.id)).toEqual(["file-1"]);
  });

  it("combines resourceType with other filters", async () => {
    currentRows = [
      { ...row("link-cheap", "link"), price: "1.00" },
      { ...row("link-pricey", "link"), price: "9.00" },
      { ...row("file-cheap", "file"), price: "1.00" },
    ];
    const result = await listCatalog({ resourceType: "link", maxPrice: "5.00" });
    expect(result.map((r) => r.id)).toEqual(["link-cheap"]);
  });
});
