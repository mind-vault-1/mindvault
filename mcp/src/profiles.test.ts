import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROFILE,
  STATE_VERSION,
  isValidProfileName,
  isValidWallet,
  migrateState,
  normalizeProfiles,
} from "./profiles.js";

const wallet = { publicKey: "GABC", secretKey: "SABC" };

describe("isValidWallet", () => {
  it("accepts a wallet with both keys", () => {
    expect(isValidWallet(wallet)).toBe(true);
  });
  it("rejects partial or malformed wallets", () => {
    expect(isValidWallet({ publicKey: "GABC" })).toBe(false);
    expect(isValidWallet({ publicKey: "GABC", secretKey: "" })).toBe(false);
    expect(isValidWallet(null)).toBe(false);
    expect(isValidWallet("nope")).toBe(false);
  });
});

describe("isValidProfileName", () => {
  it("accepts safe names", () => {
    for (const name of ["default", "testnet", "main-net", "buyer_1", "a.b", "A".repeat(64)]) {
      expect(isValidProfileName(name)).toBe(true);
    }
  });
  it("rejects empty, oversized, or unsafe names", () => {
    for (const name of ["", "a".repeat(65), "has space", "slash/name", 'quote"', 42, null]) {
      expect(isValidProfileName(name)).toBe(false);
    }
  });
});

describe("normalizeProfiles", () => {
  it("keeps valid wallet/apiKey fields and drops junk", () => {
    const out = normalizeProfiles({
      testnet: { wallet, apiKey: "key-1", extra: "ignored" },
      empty: {},
      "bad name": { wallet },
      broken: { wallet: { publicKey: "GABC" } },
    });
    expect(out).toEqual({
      testnet: { wallet, apiKey: "key-1" },
      empty: {},
      broken: {},
    });
    expect(out["bad name"]).toBeUndefined();
  });
  it("returns an empty object for non-objects", () => {
    expect(normalizeProfiles(null)).toEqual({});
    expect(normalizeProfiles("x")).toEqual({});
  });
});

describe("migrateState", () => {
  it("migrates legacy single-wallet state into the default profile", () => {
    const { state, migrated } = migrateState({ wallet, apiKey: "legacy-key" });
    expect(migrated).toBe(true);
    expect(state).toEqual({
      version: STATE_VERSION,
      activeProfile: DEFAULT_PROFILE,
      profiles: { [DEFAULT_PROFILE]: { wallet, apiKey: "legacy-key" } },
    });
  });

  it("migrates a legacy wallet even without an apiKey", () => {
    const { state, migrated } = migrateState({ wallet });
    expect(migrated).toBe(true);
    expect(state.profiles[DEFAULT_PROFILE]).toEqual({ wallet });
  });

  it("passes through current multi-profile state without migrating", () => {
    const input = {
      version: STATE_VERSION,
      activeProfile: "publisher",
      profiles: {
        publisher: { wallet, apiKey: "pk" },
        buyer: { wallet: { publicKey: "GBUY", secretKey: "SBUY" } },
      },
    };
    const { state, migrated } = migrateState(input);
    expect(migrated).toBe(false);
    expect(state.activeProfile).toBe("publisher");
    expect(Object.keys(state.profiles).sort()).toEqual(["buyer", "publisher"]);
  });

  it("falls back to the first profile when activeProfile is unknown", () => {
    const { state } = migrateState({
      activeProfile: "ghost",
      profiles: { alpha: { wallet } },
    });
    expect(state.activeProfile).toBe("alpha");
  });

  it("falls back to default when there are no profiles", () => {
    const { state } = migrateState({ profiles: {} });
    expect(state.activeProfile).toBe(DEFAULT_PROFILE);
    expect(state.profiles).toEqual({});
  });

  it("returns an empty state for corrupted or empty input", () => {
    for (const raw of [null, undefined, 42, "junk", {}, { wallet: { publicKey: "GABC" } }]) {
      const { state, migrated } = migrateState(raw);
      expect(migrated).toBe(false);
      expect(state).toEqual({
        version: STATE_VERSION,
        activeProfile: DEFAULT_PROFILE,
        profiles: {},
      });
    }
  });
});
