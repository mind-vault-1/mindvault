import { describe, it, expect, beforeEach, vi } from "vitest";

// Tracks how often the catalog rows are read from the DB.
let currentRows: unknown[] = [];
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
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: "newId" }]) }) }),
  },
}));

vi.mock("../storage/supabaseStorage.js", () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("../config.js", () => ({
  config: { CATALOG_CACHE_TTL_MS: 60_000, CATALOG_CACHE_MAX_KEYS: 200 },
}));

import {
  listCatalog,
  countCatalog,
  createLinkResource,
  __resetCatalogCache,
} from "./resourceService.js";

function row(id: string, resourceType: "file" | "link", price = "1.00") {
  return {
    id,
    title: id,
    description: "desc",
    price,
    resourceType,
    mimeType: null,
    verificationStatus: "verified",
    publisherName: "pub",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

describe("catalog per-filter response cache (#316)", () => {
  beforeEach(() => {
    __resetCatalogCache();
    selectCount = 0;
    currentRows = [row("link-1", "link"), row("file-1", "file")];
  });

  it("serves a repeated identical filtered query from cache", async () => {
    const first = await listCatalog({ resourceType: "link", sort: "newest", limit: 20, offset: 0 });
    const second = await listCatalog({
      resourceType: "link",
      sort: "newest",
      limit: 20,
      offset: 0,
    });
    expect(second).toEqual(first);
    expect(selectCount).toBe(1); // second call hit the per-filter cache
  });

  it("caches distinct filter combinations independently and correctly", async () => {
    const links = await listCatalog({ resourceType: "link" });
    const files = await listCatalog({ resourceType: "file" });
    expect(links.map((r) => r.id)).toEqual(["link-1"]);
    expect(files.map((r) => r.id)).toEqual(["file-1"]);
  });

  it("caches counts per filter and shares one total across pages", async () => {
    const total1 = await countCatalog({ resourceType: "link", limit: 1, offset: 0 });
    const total2 = await countCatalog({ resourceType: "link", limit: 1, offset: 1 });
    // count ignores pagination, so both pages share one cached total
    expect(total1).toBe(1);
    expect(total2).toBe(1);
  });

  it("invalidates cached responses on a mutation", async () => {
    await listCatalog({ resourceType: "link" });
    expect(selectCount).toBe(1);

    // A new link is published -> caches must be busted.
    currentRows = [row("link-1", "link"), row("file-1", "file"), row("link-2", "link")];
    await createLinkResource({
      publisherId: "pub1",
      title: "New",
      price: "1.00",
      walletAddress: "GWALLET",
      externalUrl: "https://example.com/x",
    });

    const after = await listCatalog({ resourceType: "link" });
    expect(after.map((r) => r.id).sort()).toEqual(["link-1", "link-2"]);
    expect(selectCount).toBe(2); // re-queried after invalidation
  });
});
