import { describe, expect, it } from "vitest";
import { compareStateSnapshots } from "./stateBackup.js";
import { STATE_VERSION, type ProfileState } from "./profiles.js";

const state: ProfileState = {
  version: STATE_VERSION,
  activeProfile: "publisher",
  profiles: {
    publisher: {
      wallet: { publicKey: "GPUB", secretKey: "SSECRET" },
      apiKey: "api-key-xyz",
      network: "stellar:testnet",
    },
  },
};

describe("state backup comparison", () => {
  it("reports a matching integrity digest without secret material", () => {
    const result = compareStateSnapshots(state, structuredClone(state));
    expect(result).toMatchObject({ integrityVerified: true, digestMatches: true, differences: [] });
    expect(JSON.stringify(result)).not.toMatch(/SSECRET|api-key-xyz|GPUB/);
  });

  it("reports only structural paths when state differs", () => {
    const backup = structuredClone(state);
    backup.activeProfile = "buyer";
    backup.profiles.publisher.apiKey = undefined;
    const result = compareStateSnapshots(state, backup);
    expect(result.digestMatches).toBe(false);
    expect(result.differences).toEqual(["activeProfile", "profiles.publisher"]);
  });
});
