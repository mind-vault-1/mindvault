import { describe, it, expect, beforeEach } from "vitest";
import {
  recordCatalogSnapshot,
  getCatalogSnapshot,
  recordPreviewSnapshot,
  getPreviewSnapshot,
  clearCatalogCache,
  _clearCatalogCache,
} from "./catalogCache.js";
import {
  activeProfileName,
  setActiveProfileName,
  catalogCacheContext,
  _resetProfiles,
} from "./runtime.js";
import { resetRegistrySchemaCache } from "./registrySchema.js";
import { useProfile, switchNetworkProfile, resetState } from "./index.js";

describe("profile cache isolation (#1186)", () => {
  beforeEach(() => {
    _clearCatalogCache();
    _resetProfiles();
    resetRegistrySchemaCache();
  });

  it("isolates catalog snapshots across different profiles", () => {
    setActiveProfileName("profile-a");
    const ctxA = catalogCacheContext();
    expect(ctxA.profile).toBe("profile-a");
    recordCatalogSnapshot([{ id: "res-a", title: "Resource A" }], "catalog", ctxA);

    setActiveProfileName("profile-b");
    const ctxB = catalogCacheContext();
    expect(ctxB.profile).toBe("profile-b");

    // Profile B should not see profile A's cached catalog
    const snapB = getCatalogSnapshot(Date.now(), "catalog", ctxB);
    expect(snapB).toBeNull();

    // Profile A still sees its cached catalog
    const snapA = getCatalogSnapshot(Date.now(), "catalog", ctxA);
    expect(snapA).not.toBeNull();
    expect(snapA?.resources).toEqual([{ id: "res-a", title: "Resource A" }]);
  });

  it("isolates preview snapshots across different profiles", () => {
    setActiveProfileName("buyer");
    const ctxBuyer = catalogCacheContext();
    recordPreviewSnapshot("shared-res", { price: "10 USDC", profile: "buyer" }, ctxBuyer);

    setActiveProfileName("seller");
    const ctxSeller = catalogCacheContext();

    // Seller profile should not reuse buyer's preview cache
    const previewSeller = getPreviewSnapshot("shared-res", Date.now(), ctxSeller);
    expect(previewSeller).toBeNull();

    const previewBuyer = getPreviewSnapshot("shared-res", Date.now(), ctxBuyer);
    expect(previewBuyer?.meta).toEqual({ price: "10 USDC", profile: "buyer" });
  });

  it("clears cached snapshots for a specific profile or all profiles", () => {
    setActiveProfileName("profile-1");
    recordCatalogSnapshot([{ id: "1" }], "catalog", catalogCacheContext());

    setActiveProfileName("profile-2");
    recordCatalogSnapshot([{ id: "2" }], "catalog", catalogCacheContext());

    // Clear only profile-1
    clearCatalogCache("profile-1");

    setActiveProfileName("profile-1");
    expect(getCatalogSnapshot(Date.now(), "catalog", catalogCacheContext())).toBeNull();

    setActiveProfileName("profile-2");
    expect(getCatalogSnapshot(Date.now(), "catalog", catalogCacheContext())).not.toBeNull();

    // Clear all
    clearCatalogCache();
    expect(getCatalogSnapshot(Date.now(), "catalog", catalogCacheContext())).toBeNull();
  });

  it("invalidates caches upon profile switch or reset", () => {
    useProfile("profile-alice");
    recordCatalogSnapshot([{ id: "alice-item" }], "catalog", catalogCacheContext());

    // Switching profile via useProfile invalidates / clears cache
    useProfile("profile-bob");
    expect(getCatalogSnapshot(Date.now(), "catalog", catalogCacheContext())).toBeNull();
  });
});
