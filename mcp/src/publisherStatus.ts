import { StrKey } from "@stellar/stellar-sdk";

import { throwHttpError } from "./errorMapping.js";
import {
  BASE_URL,
  currentApiKey,
  currentWallet,
  jsonFetch,
  publisherCredential,
} from "./runtime.js";

export type PublisherCredentialStatus = "missing" | "ready" | "different_wallet" | "revoked";

export interface PublisherVerificationArgs {
  walletAddress?: string;
}

export interface PublisherVerificationResult {
  walletAddress: string;
  registered: boolean;
  publisherId: string | null;
  name: string | null;
  createdAt: string | null;
  credentialPresent: boolean;
  credentialStatus: PublisherCredentialStatus;
  message: string;
}

type PublisherRecord = {
  id?: unknown;
  name?: unknown;
  createdAt?: unknown;
  walletAddress?: unknown;
};

function isPublisherRecord(value: unknown): value is PublisherRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function credentialMessage(
  registered: boolean,
  credentialStatus: PublisherCredentialStatus,
): string {
  if (!registered) {
    return "No publisher registration found for this wallet. Run mindvault_register to register it.";
  }
  switch (credentialStatus) {
    case "ready":
      return "Publisher is registered and the active profile credential matches this wallet.";
    case "different_wallet":
      return "Publisher is registered, but the active profile credential belongs to a different wallet.";
    case "revoked":
      return "Publisher is registered, but the active profile credential was rejected. Run mindvault_rotate_publisher_key.";
    case "missing":
      return "Publisher is registered, but this profile has no publisher API key. Run mindvault_register with this wallet.";
  }
}

export async function verifyPublisherStatus(
  args: PublisherVerificationArgs,
): Promise<PublisherVerificationResult> {
  const explicitAddress = args.walletAddress?.trim();
  if (explicitAddress && !StrKey.isValidEd25519PublicKey(explicitAddress)) {
    throw new Error(
      "walletAddress must be a valid Stellar public key (G...). Omit it to check the active profile wallet.",
    );
  }

  const wallet = currentWallet();
  const walletAddress = explicitAddress || wallet?.publicKey;
  if (!walletAddress) {
    throw new Error(
      "No wallet available. Pass walletAddress or run mindvault_setup_wallet for the active profile.",
    );
  }

  const lookup = await jsonFetch(
    `${BASE_URL}/publishers/wallet/${encodeURIComponent(walletAddress)}`,
  );
  let publisher: PublisherRecord | null = null;
  if (lookup.status === 404) {
    publisher = null;
  } else if (!lookup.ok) {
    throwHttpError({
      operation: "Publisher status lookup failed",
      source: "api",
      status: lookup.status,
      data: lookup.data,
    });
  } else if (!isPublisherRecord(lookup.data)) {
    throw new Error("Publisher status lookup returned an unexpected response body.");
  } else {
    publisher = lookup.data;
  }

  const registered = publisher !== null;
  const apiKey = currentApiKey();
  let credentialStatus: PublisherCredentialStatus = "missing";
  if (apiKey) {
    const me = await jsonFetch(`${BASE_URL}/publishers/me`, {
      headers: { "x-api-key": apiKey },
    });
    if (me.status === 401 || me.status === 403) {
      credentialStatus = "revoked";
    } else if (!me.ok) {
      throwHttpError({
        operation: "Publisher credential check failed",
        source: "api",
        status: me.status,
        data: me.data,
        credential: publisherCredential(),
      });
    } else if (!isPublisherRecord(me.data)) {
      throw new Error("Publisher credential check returned an unexpected response body.");
    } else {
      const credentialWallet = asString(me.data.walletAddress);
      credentialStatus = credentialWallet === walletAddress ? "ready" : "different_wallet";
    }
  }

  const publisherId = registered ? asString(publisher?.id) : null;
  const name = registered ? asString(publisher?.name) : null;
  const createdAt = registered ? asString(publisher?.createdAt) : null;

  return {
    walletAddress,
    registered,
    publisherId,
    name,
    createdAt,
    credentialPresent: Boolean(apiKey),
    credentialStatus,
    message: credentialMessage(registered, credentialStatus),
  };
}
