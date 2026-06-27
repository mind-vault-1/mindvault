import { beforeEach, describe, expect, it, vi } from "vitest";

let currentRows: any[] = [];

const builder = {
  from: () => builder,
  innerJoin: () => builder,
  where: () => Promise.resolve(currentRows),
};

vi.mock("../db/client.js", () => ({
  db: {
    select: () => builder,
  },
}));

vi.mock("../storage/supabaseStorage.js", () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("../config.js", () => ({ config: { CATALOG_CACHE_TTL_MS: 60_000 } }));

import { __resetCatalogCache, listCatalog } from "./resourceService.js";

describe("listCatalog price-range filtering (#159)", () => {
  beforeEach(() => {
    __resetCatalogCache();
    // Prices stored as decimal strings, as in the DB.
    currentRows = [
      { id: "below", title: "Cheap", description: "x", price: "0.25", resourceType: "file" },
      { id: "atMin", title: "At minimum", description: "x", price: "0.50", resourceType: "file" },
      { id: "mid", title: "Middle Stellar", description: "x", price: "1.00", resourceType: "link" },
      { id: "atMax", title: "At maximum", description: "x", price: "5.00", resourceType: "file" },
      { id: "above", title: "Pricey", description: "x", price: "5.50", resourceType: "file" },
    ];
  });

  it("returns only resources in range for minPrice=0.50&maxPrice=5.00 (acceptance example)", async () => {
    const rows = await listCatalog({ minPrice: "0.50", maxPrice: "5.00" });
    expect(rows.map((r) => r.id)).toEqual(["atMin", "mid", "atMax"]);
  });

  it("includes a resource priced exactly at minPrice (inclusive lower bound)", async () => {
    const rows = await listCatalog({ minPrice: "0.50" });
    expect(rows.map((r) => r.id)).toContain("atMin");
    expect(rows.map((r) => r.id)).not.toContain("below");
  });

  it("includes a resource priced exactly at maxPrice (inclusive upper bound)", async () => {
    const rows = await listCatalog({ maxPrice: "5.00" });
    expect(rows.map((r) => r.id)).toContain("atMax");
    expect(rows.map((r) => r.id)).not.toContain("above");
  });

  it("excludes a resource priced just below minPrice", async () => {
    const rows = await listCatalog({ minPrice: "0.50", maxPrice: "5.00" });
    expect(rows.map((r) => r.id)).not.toContain("below");
  });

  it("excludes a resource priced just above maxPrice", async () => {
    const rows = await listCatalog({ minPrice: "0.50", maxPrice: "5.00" });
    expect(rows.map((r) => r.id)).not.toContain("above");
  });

  it("returns only exact matches when minPrice equals maxPrice", async () => {
    const rows = await listCatalog({ minPrice: "1.00", maxPrice: "1.00" });
    expect(rows.map((r) => r.id)).toEqual(["mid"]);
  });

  it("filters with only minPrice supplied", async () => {
    const rows = await listCatalog({ minPrice: "5.00" });
    expect(rows.map((r) => r.id)).toEqual(["atMax", "above"]);
  });

  it("filters with only maxPrice supplied", async () => {
    const rows = await listCatalog({ maxPrice: "0.50" });
    expect(rows.map((r) => r.id)).toEqual(["below", "atMin"]);
  });

  it("returns all listed resources when neither bound is supplied", async () => {
    const rows = await listCatalog();
    expect(rows).toHaveLength(5);
  });

  it("combines price range with a search term", async () => {
    const rows = await listCatalog({ minPrice: "0.50", maxPrice: "5.00", search: "stellar" });
    expect(rows.map((r) => r.id)).toEqual(["mid"]);
  });
});
