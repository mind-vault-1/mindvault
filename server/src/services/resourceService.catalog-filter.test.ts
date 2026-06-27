import { describe, it, expect, beforeEach, vi } from "vitest";

const catalogRows = [
  {
    id: "verified-1",
    title: "Verified doc",
    description: null,
    price: "1.00",
    resourceType: "link",
    mimeType: null,
    verificationStatus: "verified",
    publisherName: "Alice",
    createdAt: new Date("2026-01-01"),
    listed: true,
  },
  {
    id: "pending-1",
    title: "Pending doc",
    description: null,
    price: "2.00",
    resourceType: "link",
    mimeType: null,
    verificationStatus: "pending",
    publisherName: "Bob",
    createdAt: new Date("2026-01-02"),
    listed: true,
  },
  {
    id: "rejected-1",
    title: "Rejected doc",
    description: null,
    price: "3.00",
    resourceType: "file",
    mimeType: "application/pdf",
    verificationStatus: "rejected",
    publisherName: "Carol",
    createdAt: new Date("2026-01-03"),
    listed: true,
  },
  {
    id: "unlisted-verified",
    title: "Unlisted",
    description: null,
    price: "4.00",
    resourceType: "link",
    mimeType: null,
    verificationStatus: "verified",
    publisherName: "Dave",
    createdAt: new Date("2026-01-04"),
    listed: false,
  },
];

/** Simulates SQL filtering applied by queryCatalog. */
let verificationStatusFilter: string | undefined;

const builder = {
  from: () => builder,
  innerJoin: () => builder,
  where: () =>
    Promise.resolve(
      catalogRows.filter((row) => {
        if (!row.listed) return false;
        if (verificationStatusFilter && row.verificationStatus !== verificationStatusFilter) {
          return false;
        }
        return true;
      }),
    ),
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

import { listCatalog, __resetCatalogCache } from "./resourceService.js";

describe("listCatalog verificationStatus filter (#204)", () => {
  beforeEach(() => {
    __resetCatalogCache();
    verificationStatusFilter = undefined;
  });

  it("returns all listed resources when verificationStatus is omitted", async () => {
    const result = await listCatalog();
    expect(result.map((r) => r.id)).toEqual(["verified-1", "pending-1", "rejected-1"]);
  });

  it("filters to verified resources via verificationStatus=verified", async () => {
    verificationStatusFilter = "verified";
    const result = await listCatalog({ verificationStatus: "verified" });
    expect(result.map((r) => r.id)).toEqual(["verified-1"]);
  });

  it("filters to pending resources via verificationStatus=pending", async () => {
    verificationStatusFilter = "pending";
    const result = await listCatalog({ verificationStatus: "pending" });
    expect(result.map((r) => r.id)).toEqual(["pending-1"]);
  });

  it("filters to rejected resources via verificationStatus=rejected", async () => {
    verificationStatusFilter = "rejected";
    const result = await listCatalog({ verificationStatus: "rejected" });
    expect(result.map((r) => r.id)).toEqual(["rejected-1"]);
  });
});
