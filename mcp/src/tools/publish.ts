import { createRegistryClient, Errors as RegistryErrors } from "@mindvault/registry-client";
import {
  activeProfile,
  activeProfileName,
  BASE_URL,
  currentApiKey,
  jsonFetch,
  makePaidFetch,
  metrics,
  NETWORK,
  _isMock,
  publisherCredential,
  REGISTRY_CONTRACT_ID,
  REGISTRY_NETWORK_PASSPHRASE,
  requireApiKey,
  requireWallet,
  saveState,
  SOROBAN_RPC_URL,
  STATE_FILE,
} from "../runtime.js";
import { insufficientFundsMessage } from "./registry.js";
import {
  isTimeoutError,
  mapHttpError,
  mapRegistryError,
  mapTransportError,
  mcpError,
  throwHttpError,
} from "../errorMapping.js";
import { dryRunPublish, dryRunBuy } from "../dryRun.js";
import { safeErrorMessage } from "../redaction.js";
import { recordPurchase } from "../purchaseHistory.js";
import { mockSetListed, mockSetPrice, mockTransferOwnership, mockUpdateMetadata } from "../mock.js";

export function usdcToStroops(usdc: string): bigint {
  const parts = usdc.split(".");
  const whole = BigInt(parts[0] || "0");
  const fracStr = (parts[1] || "").padEnd(7, "0").slice(0, 7);
  const frac = BigInt(fracStr);
  return whole * 10_000_000n + frac;
}

export async function register(
  name: string,
  email: string,
  walletAddress?: string,
): Promise<string> {
  const wallet = requireWallet();
  const res = await jsonFetch(`${BASE_URL}/publishers`, {
    method: "POST",
    body: JSON.stringify({ name, email, walletAddress: walletAddress ?? wallet.publicKey }),
  });
  if (!res.ok)
    throwHttpError({
      operation: "Register failed",
      source: "api",
      status: res.status,
      data: res.data,
    });
  activeProfile().apiKey = res.data.apiKey;
  saveState();
  return `Registered as publisher.\nProfile: ${activeProfileName}\nID: ${res.data.id}\nAPI key persisted to ${STATE_FILE} (not shown). Run mindvault_reset to revoke.`;
}

export async function publish(args: {
  title: string;
  description?: string;
  price: string;
  externalUrl: string;
  dryRun?: boolean;
}): Promise<string> {
  if (args.dryRun) {
    return JSON.stringify(
      dryRunPublish(args, NETWORK, BASE_URL, !!activeProfile().wallet, !!currentApiKey()),
      null,
      2,
    );
  }

  const wallet = requireWallet();
  const apiKey = requireApiKey();

  const createRes = await jsonFetch(`${BASE_URL}/resources`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: JSON.stringify({
      title: args.title,
      description: args.description,
      price: args.price,
      externalUrl: args.externalUrl,
    }),
  });
  if (!createRes.ok)
    throwHttpError({
      operation: "Publish failed",
      source: "api",
      status: createRes.status,
      data: createRes.data,
      credential: publisherCredential(),
    });
  const resource = createRes.data;

  const statusRes = await jsonFetch(`${BASE_URL}/agent/status`);
  const verificationPrice = statusRes.ok ? statusRes.data?.agent?.pricePerVerification : null;
  if (verificationPrice != null) {
    const shortMsg = await insufficientFundsMessage(
      wallet,
      verificationPrice,
      "pay the content verification fee",
    );
    if (shortMsg) {
      return `${shortMsg}\n(Resource created with id ${resource.id}; verify it later once funded.)`;
    }
  }

  const paidFetch = makePaidFetch(wallet);

  const verifyRes = await paidFetch(`${BASE_URL}/verify-content`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `Title: ${args.title}\nDescription: ${args.description ?? ""}\nURL: ${args.externalUrl}`,
      resourceId: resource.id,
    }),
  });
  metrics.recordPayment(verifyRes.ok);

  const verifyData = await verifyRes.json().catch(() => null);

  if (!verifyRes.ok) {
    return (
      `Resource created (id: ${resource.id}) but verification payment failed.\n` +
      `Status: ${verifyRes.status}\n${JSON.stringify(verifyData)}`
    );
  }

  const isOriginal: boolean = verifyData?.isOriginal ?? false;
  const flags: string[] = verifyData?.flags ?? [];

  if (!isOriginal) {
    return [
      `Resource created but rejected by verification.`,
      `ID: ${resource.id}`,
      `Verification: rejected ✗`,
      flags.length ? `Flags: ${flags.join("; ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const registerRes = await jsonFetch(`${BASE_URL}/resources/${resource.id}/register`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
  });

  const onchainStatus: string = registerRes.ok
    ? (registerRes.data.onchainStatus ?? "registered")
    : "failed";
  const onchainTxHash: string | null = registerRes.ok
    ? (registerRes.data.onchainTxHash ?? null)
    : ((registerRes.data?.txHash as string | undefined) ?? null);

  const failureGuidance: string[] = [];
  if (!registerRes.ok) {
    const data = registerRes.data ?? {};
    const retryEndpoint =
      typeof data.retryEndpoint === "string"
        ? data.retryEndpoint
        : `POST ${BASE_URL}/resources/${resource.id}/register`;
    failureGuidance.push(
      `Registration failed — the resource is still listed and purchasable.`,
      typeof data.message === "string" ? data.message : `Detail: ${data.detail ?? "unknown error"}`,
      `Retry endpoint: ${retryEndpoint} (send your x-api-key; no body re-runs server-side registration).`,
    );
    if (typeof data.txStatusUrl === "string") {
      failureGuidance.push(`Transaction status: ${data.txStatusUrl}`);
    } else if (onchainTxHash) {
      failureGuidance.push(`Check transaction ${onchainTxHash} with mindvault_tx_status.`);
    }
    if (Array.isArray(data.nextSteps)) {
      failureGuidance.push("Next steps:", ...data.nextSteps.map((s: string) => `  - ${s}`));
    }
  }

  const summary = {
    before: {
      id: null,
      title: null,
      price: null,
      accessUrl: null,
      verificationStatus: null,
      onchainStatus: null,
    },
    after: {
      id: resource.id,
      title: resource.title,
      price: resource.price,
      accessUrl: resource.accessUrl,
      verificationStatus: "approved",
      onchainStatus,
    },
    changedFields: ["id", "title", "price", "accessUrl", "verificationStatus", "onchainStatus"],
    txHash: onchainTxHash,
    failureGuidance: failureGuidance.length > 0 ? failureGuidance : null,
  };

  return JSON.stringify(summary, null, 2);
}

export async function buy(
  resourceId: string,
  dryRun?: boolean,
  estimatedPrice?: string | null,
  onProgress?: (progress: number, total?: number, message?: string) => Promise<void>,
): Promise<string> {
  if (dryRun) {
    return JSON.stringify(
      dryRunBuy(resourceId, NETWORK, BASE_URL, !!activeProfile().wallet, estimatedPrice ?? null),
      null,
      2,
    );
  }

  const wallet = requireWallet();

  await onProgress?.(1, 4, "Validating resource");
  const meta = await jsonFetch(`${BASE_URL}/resources/${resourceId}/meta`);
  if (meta.ok && meta.data?.price != null) {
    const shortMsg = await insufficientFundsMessage(
      wallet,
      meta.data.price,
      `buy "${meta.data.title ?? resourceId}"`,
    );
    if (shortMsg) return shortMsg;
  }

  const beforeState = meta.ok
    ? {
        id: meta.data.id,
        title: meta.data.title,
        price: meta.data.price,
        accessUrl: meta.data.accessUrl,
        purchased: false,
      }
    : null;

  const paidFetch = makePaidFetch(wallet);
  let res: Response;
  try {
    await onProgress?.(2, 4, "Submitting payment");
    res = await paidFetch(`${BASE_URL}/resources/${resourceId}`);
  } catch (err) {
    metrics.recordPayment(false);
    throw mcpError(mapTransportError({ operation: "Buy failed", source: "x402", error: err }));
  }
  metrics.recordPayment(res.ok);
  if (!res.ok) {
    const text = await res.text();
    throwHttpError({
      operation: `Buy failed [${res.status}]`,
      source: "x402",
      status: res.status,
      data: text,
    });
  }
  const afterData = await res.json();
  const txHash = afterData.txHash || null;
  const receipt =
    afterData.receipt && typeof afterData.receipt === "object" ? afterData.receipt : null;
  const amount =
    (receipt?.amount != null ? String(receipt.amount) : null) ??
    (meta.ok && meta.data?.price != null ? String(meta.data.price) : null) ??
    (afterData.price != null ? String(afterData.price) : "");
  const title =
    (typeof afterData.title === "string" && afterData.title) ||
    (meta.ok && typeof meta.data?.title === "string" ? meta.data.title : undefined);

  await onProgress?.(3, 4, "Recording purchase");
  try {
    recordPurchase({
      resourceId,
      amount,
      network: NETWORK,
      txHash,
      receiptRef: receipt?.paymentId != null ? String(receipt.paymentId) : null,
      ...(title ? { title } : {}),
    });
  } catch (err) {
    console.error("MindVault MCP: failed to persist purchase receipt:", safeErrorMessage(err));
  }

  const summary = {
    before: beforeState,
    after: {
      ...afterData,
      purchased: true,
    },
    changedFields: beforeState ? ["purchased"] : ["id", "title", "price", "accessUrl", "purchased"],
    txHash,
  };

  await onProgress?.(4, 4, "Done");

  return JSON.stringify(summary, null, 2);
}

export async function registerOnchain(
  resourceId: string,
  onProgress?: (progress: number, total?: number, message?: string) => Promise<void>,
): Promise<string> {
  const wallet = requireWallet();
  const apiKey = requireApiKey();
  if (!resourceId) throw new Error("resourceId is required.");

  await onProgress?.(1, 3, "Preparing transaction");
  const prep = await jsonFetch(`${BASE_URL}/resources/${resourceId}/register/prepare`, {
    headers: { "x-api-key": apiKey },
  });
  if (!prep.ok) {
    const mapped = mapHttpError({
      operation: `Could not prepare on-chain registration for "${resourceId}" [${prep.status}]`,
      source: "api",
      status: prep.status,
      data: prep.data,
      credential: publisherCredential(),
    });
    const specific = [
      prep.status === 400 ? "The resource must be verified before it can be registered." : null,
      prep.status === 409
        ? "The resource is already registered on-chain — no action needed."
        : null,
    ].filter(Boolean);
    throw mcpError({
      ...mapped,
      action: [...specific, mapped.action].join(" "),
    });
  }

  const { unsignedXdr, networkPassphrase } = prep.data ?? {};
  if (!unsignedXdr) {
    throw new Error(
      `register/prepare did not return an unsigned transaction: ${JSON.stringify(prep.data)}`,
    );
  }

  await onProgress?.(2, 3, "Signing transaction");
  const { Keypair, Transaction } = await import("@stellar/stellar-sdk");
  const passphrase = networkPassphrase ?? REGISTRY_NETWORK_PASSPHRASE;
  const tx = new Transaction(unsignedXdr, passphrase);
  tx.sign(Keypair.fromSecret(wallet.secretKey));
  const signedXdr = tx.toXDR();

  await onProgress?.(3, 3, "Submitting transaction");
  const submit = await jsonFetch(`${BASE_URL}/resources/${resourceId}/register`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: JSON.stringify({ signedXdr }),
  });
  if (!submit.ok) {
    const txHash = submit.data && typeof submit.data === "object" ? submit.data.txHash : undefined;
    const mapped = mapHttpError({
      operation: `On-chain registration failed for "${resourceId}" [${submit.status}]`,
      source: "api",
      status: submit.status,
      data: submit.data,
      credential: publisherCredential(),
    });
    throw mcpError({
      ...mapped,
      action: [
        "The resource remains listed and purchasable.",
        "Ensure the agent wallet is funded for fees and retry.",
        txHash ? `Tx hash: ${txHash} (check with mindvault_tx_status).` : null,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  const summary = {
    before: {
      id: resourceId,
      onchainStatus: null,
      txHash: null,
    },
    after: {
      id: resourceId,
      onchainStatus: submit.data.onchainStatus ?? "registered",
      txHash: submit.data.txHash ?? null,
    },
    changedFields: ["onchainStatus", "txHash"],
    txHash: submit.data.txHash ?? null,
  };

  return JSON.stringify(summary, null, 2);
}

export async function agentStatus(): Promise<string> {
  const res = await jsonFetch(`${BASE_URL}/agent/status`);
  if (!res.ok)
    throwHttpError({
      operation: "Agent status failed",
      source: "api",
      status: res.status,
      data: res.data,
    });
  return JSON.stringify(res.data, null, 2);
}

function makeClient(publicKey: string) {
  return createRegistryClient({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
    publicKey,
  });
}

interface RegistryTx {
  signAndSend(input: {
    signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>;
  }): Promise<{ sendTransactionResponse?: { hash?: string | null } | null } | undefined | null>;
}

async function signAndSendRegistryTx(
  resourceId: string,
  label: string,
  tx: RegistryTx,
  secretKey: string,
): Promise<string | null> {
  const { Keypair } = await import("@stellar/stellar-sdk");
  const keypair = Keypair.fromSecret(secretKey);
  let sentTx;
  try {
    sentTx = await tx.signAndSend({
      signTransaction: async (xdr: string) => {
        const { Transaction } = await import("@stellar/stellar-sdk");
        const stellarTx = new Transaction(xdr, REGISTRY_NETWORK_PASSPHRASE);
        stellarTx.sign(keypair);
        return { signedTxXdr: stellarTx.toXDR() };
      },
    });
  } catch (err: any) {
    throw mcpError(
      mapRegistryError({
        operation: `${label} submission failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }
  const txHash = sentTx?.sendTransactionResponse?.hash ?? null;
  return txHash;
}

export async function updateMetadata(resourceId: string, metadata: string): Promise<string> {
  const wallet = requireWallet();
  if (_isMock()) return mockUpdateMetadata(resourceId, metadata);

  const client = makeClient(wallet.publicKey);

  let tx: Awaited<ReturnType<typeof client.update_metadata>>;
  try {
    tx = await client.update_metadata({ id: resourceId, metadata });
  } catch (err: any) {
    if (isTimeoutError(err)) {
      throw mcpError(
        mapTransportError({
          operation: `Update metadata failed for resource "${resourceId}"`,
          source: "soroban",
          error: err,
        }),
      );
    }
    throw mcpError(
      mapRegistryError({
        operation: `Update metadata failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }

  const result = tx.result;
  if (result.isErr()) {
    const err = result.unwrapErr();
    const notFound = err.message === RegistryErrors[2].message;
    throw mcpError(
      mapRegistryError({
        operation: `Update metadata failed for resource "${resourceId}"`,
        message: err.message,
        notFound,
      }),
    );
  }

  const txHash = await signAndSendRegistryTx(resourceId, "Update metadata", tx, wallet.secretKey);
  return JSON.stringify(
    {
      status: "success",
      resourceId,
      metadata,
      txHash,
    },
    null,
    2,
  );
}

export async function setPrice(resourceId: string, price: string): Promise<string> {
  const wallet = requireWallet();
  if (_isMock()) return mockSetPrice(resourceId, price);

  const stroops = usdcToStroops(price);
  const client = makeClient(wallet.publicKey);

  let tx: Awaited<ReturnType<typeof client.set_price>>;
  try {
    tx = await client.set_price({ id: resourceId, new_price: stroops });
  } catch (err: any) {
    if (isTimeoutError(err)) {
      throw mcpError(
        mapTransportError({
          operation: `Set price failed for resource "${resourceId}"`,
          source: "soroban",
          error: err,
        }),
      );
    }
    throw mcpError(
      mapRegistryError({
        operation: `Set price failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }

  const result = tx.result;
  if (result.isErr()) {
    const err = result.unwrapErr();
    const notFound = err.message === RegistryErrors[2].message;
    throw mcpError(
      mapRegistryError({
        operation: `Set price failed for resource "${resourceId}"`,
        message: err.message,
        notFound,
      }),
    );
  }

  const txHash = await signAndSendRegistryTx(resourceId, "Set price", tx, wallet.secretKey);
  return JSON.stringify(
    {
      status: "success",
      resourceId,
      price,
      txHash,
    },
    null,
    2,
  );
}

export async function transferOwnership(resourceId: string, newCreator: string): Promise<string> {
  const wallet = requireWallet();
  if (_isMock()) return mockTransferOwnership(resourceId, newCreator);

  const client = makeClient(wallet.publicKey);

  let tx: Awaited<ReturnType<typeof client.transfer_ownership>>;
  try {
    tx = await client.transfer_ownership({ id: resourceId, new_creator: newCreator });
  } catch (err: any) {
    if (isTimeoutError(err)) {
      throw mcpError(
        mapTransportError({
          operation: `Transfer ownership failed for resource "${resourceId}"`,
          source: "soroban",
          error: err,
        }),
      );
    }
    throw mcpError(
      mapRegistryError({
        operation: `Transfer ownership failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }

  const result = tx.result;
  if (result.isErr()) {
    const err = result.unwrapErr();
    const notFound = err.message === RegistryErrors[2].message;
    throw mcpError(
      mapRegistryError({
        operation: `Transfer ownership failed for resource "${resourceId}"`,
        message: err.message,
        notFound,
      }),
    );
  }

  const txHash = await signAndSendRegistryTx(
    resourceId,
    "Transfer ownership",
    tx,
    wallet.secretKey,
  );
  return JSON.stringify(
    {
      status: "success",
      resourceId,
      newCreator,
      txHash,
    },
    null,
    2,
  );
}

export async function setListed(resourceId: string, listed: boolean): Promise<string> {
  const wallet = requireWallet();
  if (_isMock()) return mockSetListed(resourceId, listed);

  const client = makeClient(wallet.publicKey);

  let tx: Awaited<ReturnType<typeof client.set_listed>>;
  try {
    tx = await client.set_listed({ id: resourceId, listed });
  } catch (err: any) {
    if (isTimeoutError(err)) {
      throw mcpError(
        mapTransportError({
          operation: `Set listed failed for resource "${resourceId}"`,
          source: "soroban",
          error: err,
        }),
      );
    }
    throw mcpError(
      mapRegistryError({
        operation: `Set listed failed for resource "${resourceId}"`,
        message: err?.message || String(err),
      }),
    );
  }

  const result = tx.result;
  if (result.isErr()) {
    const err = result.unwrapErr();
    const notFound = err.message === RegistryErrors[2].message;
    throw mcpError(
      mapRegistryError({
        operation: `Set listed failed for resource "${resourceId}"`,
        message: err.message,
        notFound,
      }),
    );
  }

  const txHash = await signAndSendRegistryTx(resourceId, "Set listed", tx, wallet.secretKey);
  return JSON.stringify(
    {
      status: "success",
      resourceId,
      listed,
      txHash,
    },
    null,
    2,
  );
}
