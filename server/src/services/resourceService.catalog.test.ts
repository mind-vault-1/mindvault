import { beforeEach, describe, expect, it, vi } from "vitest";

let currentRows: any[] = [];
let selectCount = 0;

const builder = {
  from: () => builder,
  innerJoin: () => builder,
  where: () => Promise.resolve(currentRows),
};

vi.mock("../db/client.js", () => ({
  db: {
    select: () => {
      selectCount += 1;
      return builder;
    },
  },
}));

vi.mock("../storage/supabaseStorage.js", () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("../config.js", () => ({ config: { CATALOG_CACHE_TTL_MS: 60_000 } }));

import { __resetCatalogCache, listCatalog } from "./resourceService.js";

const allRows = [
  {
    id: "r1",
    title: "Alpha Guide",
    description: "Learn the basics",
    price: "0.50",
    resourceType: "file",
    verificationStatus: "verified",
    publisherName: "Alice",
  },
  {
    id: "r2",
    title: "Beta Notes",
    description: "Advanced techniques",
    price: "2.00",
    resourceType: "link",
    verificationStatus: "pending",
    publisherName: "Bob",
  },
  {
    id: "r3",
    title: "Gamma Pack",
    description: "Reference materials",
    price: "1.25",
    resourceType: "file",
    verificationStatus: "rejected",
    publisherName: "Carol",
  },
];

describe("resourceService catalog filters", () => {
  beforeEach(() => {
    __resetCatalogCache();
    currentRows = allRows;
    selectCount = 0;
  });

  it("keeps the unfiltered catalog behavior unchanged", async () => {
    const rows = await listCatalog();

    expect(rows).toHaveLength(3);
    expect(selectCount).toBe(1);
  });

  it("filters by search text", async () => {
    currentRows = allRows.filter((r) =>
      r.title.toLowerCase().includes("alpha") ||
      (r.description ?? "").toLowerCase().includes("alpha"),
    );
    const rows = await listCatalog({ search: "alpha" });

    expect(rows.map((row) => row.id)).toEqual(["r1"]);
  });

  it("filters by price range", async () => {
    currentRows = allRows.filter((r) => parseFloat(r.price) >= 1.00 && parseFloat(r.price) <= 1.50);
    const rows = await listCatalog({ minPrice: "1.00", maxPrice: "1.50" });

    expect(rows.map((row) => row.id)).toEqual(["r3"]);
  });

  it("filters by verification status", async () => {
    currentRows = allRows.filter((r) => r.verificationStatus === "pending");
    const rows = await listCatalog({ verificationStatus: "pending" });

    expect(rows.map((row) => row.id)).toEqual(["r2"]);
  });

  it("filters by resource type", async () => {
    currentRows = allRows.filter((r) => r.resourceType === "file");
    const rows = await listCatalog({ resourceType: "file" });

    expect(rows.map((row) => row.id)).toEqual(["r1", "r3"]);
  });
});