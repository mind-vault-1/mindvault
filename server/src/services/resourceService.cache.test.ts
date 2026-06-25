import { describe, it, expect, beforeEach, vi } from "vitest";

// State the db mock serves; tests mutate these before each scenario.
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

// Avoid constructing a real Supabase client at import time.
vi.mock("../storage/supabaseStorage.js", () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("../config.js", () => ({ config: { CATALOG_CACHE_TTL_MS: 60_000 } }));

import {
  listCatalog,
  getResourceMeta,
  createLinkResource,
  __resetCatalogCache,
} from "./resourceService.js";

describe("resourceService read cache (#115)", () => {
  beforeEach(() => {
    __resetCatalogCache();
    selectCount = 0;
  });

  it("serves repeated catalog reads from cache within the TTL", async () => {
    currentRows = [{ id: "r1", title: "Doc" }];

    const first = await listCatalog();
    const second = await listCatalog();

    expect(selectCount).toBe(1); // only one DB hit
    expect(second).toEqual(first);
  });

  it("caches a resource preview per id but not a 404 miss", async () => {
    currentRows = [{ id: "r1", title: "Doc" }];
    await getResourceMeta("r1");
    await getResourceMeta("r1");
    expect(selectCount).toBe(1);

    // A missing resource (null) must not be cached, so it stays queryable.
    __resetCatalogCache();
    selectCount = 0;
    currentRows = [];
    await getResourceMeta("missing");
    await getResourceMeta("missing");
    expect(selectCount).toBe(2);
  });

  it("invalidates the catalog when a resource is published", async () => {
    currentRows = [{ id: "r1", title: "Doc" }];
    await listCatalog();
    expect(selectCount).toBe(1);

    await createLinkResource({
      publisherId: "pub1",
      title: "New",
      price: "1.00",
      walletAddress: "GWALLET",
      externalUrl: "https://example.com/x",
    });

    await listCatalog();
    expect(selectCount).toBe(2); // cache was busted, DB queried again
  });
});
