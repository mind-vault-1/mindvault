import { beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

const state = vi.hoisted(() => ({
  wallet: null as { publicKey: string } | null,
  apiKey: null as string | null,
  publisher: null as Record<string, unknown> | null,
  meStatus: 200,
}));

vi.mock("./runtime.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    BASE_URL: "https://api.test.com",
    currentWallet: () => state.wallet,
    currentApiKey: () => state.apiKey,
    jsonFetch: async (url: string) => {
      if (url.includes("/publishers/me")) {
        return {
          ok: state.meStatus === 200,
          status: state.meStatus,
          data:
            state.meStatus === 200
              ? {
                  id: "pub-1",
                  walletAddress: state.wallet?.publicKey,
                  name: "Agent",
                  createdAt: "2026-01-01",
                }
              : { error: "invalid api key" },
          headers: {},
        };
      }
      if (state.publisher) {
        return { ok: true, status: 200, data: state.publisher, headers: {} };
      }
      return {
        ok: false,
        status: 404,
        data: { error: "No publisher found for this wallet" },
        headers: {},
      };
    },
  };
});

const { verifyPublisherStatus } = await import("./publisherStatus.js");

describe("verifyPublisherStatus", () => {
  beforeEach(() => {
    state.wallet = { publicKey: Keypair.random().publicKey() };
    state.apiKey = null;
    state.publisher = null;
    state.meStatus = 200;
  });

  it("reports a registered publisher and a matching credential", async () => {
    state.apiKey = "secret-key";
    state.publisher = {
      id: "pub-1",
      name: "Agent",
      createdAt: "2026-01-01",
      walletAddress: state.wallet!.publicKey,
    };

    const result = await verifyPublisherStatus({});

    expect(result).toEqual({
      walletAddress: state.wallet!.publicKey,
      registered: true,
      publisherId: "pub-1",
      name: "Agent",
      createdAt: "2026-01-01",
      credentialPresent: true,
      credentialStatus: "ready",
      message: "Publisher is registered and the active profile credential matches this wallet.",
    });
  });

  it("reports an unregistered wallet without exposing credentials", async () => {
    const result = await verifyPublisherStatus({});

    expect(result).toMatchObject({
      registered: false,
      publisherId: null,
      name: null,
      createdAt: null,
      credentialPresent: false,
      credentialStatus: "missing",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("reports a credential that belongs to another wallet", async () => {
    state.apiKey = "secret-key";
    state.publisher = {
      id: "pub-2",
      name: "Other Agent",
      createdAt: "2026-02-01",
      walletAddress: state.wallet!.publicKey,
    };
    state.wallet = { publicKey: Keypair.random().publicKey() };

    const result = await verifyPublisherStatus({
      walletAddress: state.publisher.walletAddress as string,
    });

    expect(result.credentialStatus).toBe("different_wallet");
  });

  it("reports a revoked credential", async () => {
    state.apiKey = "secret-key";
    state.publisher = {
      id: "pub-1",
      name: "Agent",
      createdAt: "2026-01-01",
      walletAddress: state.wallet!.publicKey,
    };
    state.meStatus = 401;

    const result = await verifyPublisherStatus({});

    expect(result.credentialStatus).toBe("revoked");
  });

  it("rejects an invalid wallet address", async () => {
    await expect(verifyPublisherStatus({ walletAddress: "not-a-key" })).rejects.toThrow(
      /valid Stellar public key/,
    );
  });
});
