import { type Resource, Networks } from "@mindvault/registry-client";

export type { Resource };
export { Networks as registryNetworks };

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface CatalogFilters {
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  verificationStatus?: "all" | "verified" | "pending" | "rejected";
  resourceType?: "all" | "file" | "link";
}

export interface ResourceMeta {
  id: string;
  title: string;
  description?: string | null;
  price: string;
  resourceType: string;
  mimeType?: string | null;
  verificationStatus: string;
  publisherName?: string;
  publisherWallet: string;
  onchainStatus: string;
  onchainTxHash?: string | null;
  createdAt: string;
  accessUrl: string;
}

export async function fetchResourceMeta(id: string, signal?: AbortSignal): Promise<ResourceMeta> {
  const res = await fetch(`${API_BASE}/resources/${id}/meta`, { signal });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: undefined }));
    throw new Error(error ?? "Failed to load resource preview");
  }
  return res.json();
}

export async function fetchCatalog(filters?: CatalogFilters): Promise<any[]> {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.minPrice) params.set("minPrice", filters.minPrice);
  if (filters?.maxPrice) params.set("maxPrice", filters.maxPrice);
  if (filters?.verificationStatus && filters.verificationStatus !== "all")
    params.set("verificationStatus", filters.verificationStatus);
  if (filters?.resourceType && filters.resourceType !== "all")
    params.set("resourceType", filters.resourceType);

  const qs = params.toString();
  const res = await fetch(`${API_BASE}/resources${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch catalog");
  return res.json();
}

export async function fetchMyResources(apiKey: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/publishers/me/resources`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) throw new Error("Failed to fetch your resources");
  return res.json();
}

export async function prepareRegister(
  resourceId: string,
  apiKey: string,
): Promise<{ unsignedXdr: string; networkPassphrase: string }> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/register/prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error ?? "Failed to prepare register transaction");
  }
  return res.json();
}

export async function submitRegister(
  resourceId: string,
  signedXdr: string,
  apiKey: string,
): Promise<{ id: string; onchainStatus: string; onchainTxHash?: string }> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ signedXdr }),
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error ?? "Failed to submit register transaction");
  }
  return res.json();
}

export async function prepareRegisterTx(
  resourceId: string,
  apiKey: string,
): Promise<{
  unsignedXdr: string;
  networkPassphrase: string;
  metadata: {
    resourceId: string;
    creator: string;
    price: string;
    title: string;
    description?: string;
  };
}> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/register/prepare`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error ?? "Failed to prepare register transaction");
  }
  return res.json();
}

export async function submitRegisterTx(
  resourceId: string,
  signedXdr: string,
  apiKey: string,
): Promise<{ id: string; onchainStatus: string; txHash: string }> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ signedXdr }),
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error ?? "Failed to submit register transaction");
  }
  return res.json();
}

export async function prepareSetPrice(
  resourceId: string,
  price: string,
  apiKey: string,
): Promise<{ unsignedXdr: string; networkPassphrase: string }> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/price/prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ price }),
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error ?? "Failed to prepare transaction");
  }
  return res.json();
}

export async function fetchRegistryStatus(): Promise<{ resourceCount: number }> {
  const res = await fetch(`${API_BASE}/registry/status`);
  if (!res.ok) throw new Error("Failed to fetch registry status");
  return res.json();
}

export async function prepareTransferOwnership(
  resourceId: string,
  newCreator: string,
  apiKey: string,
): Promise<{ unsignedXdr: string; networkPassphrase: string }> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/ownership/prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ newCreator }),
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error ?? "Failed to prepare transfer transaction");
  }
  return res.json();
}

export async function submitTransferOwnership(
  resourceId: string,
  signedXdr: string,
  newCreator: string,
  apiKey: string,
): Promise<{ id: string; newCreator: string; status: string }> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/ownership`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ signedXdr, newCreator }),
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error ?? "Failed to submit transfer transaction");
  }
  return res.json();
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  walletAddress: string;
  joinedAt: string;
  totalResources: number;
  listedResources: number;
  verifiedResources: number;
  totalSales: number;
  totalEarned: string;
}

export async function fetchLeaderboard(signal?: AbortSignal): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_BASE}/publishers/leaderboard`, { signal });
  if (!res.ok) throw new Error("Failed to fetch leaderboard");
  return res.json();
}

export async function publishLinkResource(
  data: { title: string; description?: string; price: string; externalUrl: string },
  apiKey: string,
  signal?: AbortSignal,
): Promise<any> {
  const res = await fetch(`${API_BASE}/resources`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(data),
    signal,
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: undefined }));
    throw new Error(error ?? "Failed to publish resource");
  }
  return res.json();
}

export async function publishFileResource(
  formData: FormData,
  apiKey: string,
  signal?: AbortSignal,
): Promise<any> {
  const res = await fetch(`${API_BASE}/resources`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: formData,
    signal,
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: undefined }));
    throw new Error(error ?? "Failed to publish resource");
  }
  return res.json();
}

export async function submitSetPrice(
  resourceId: string,
  signedXdr: string,
  price: string,
  apiKey: string,
): Promise<{ id: string; price: string; status: string }> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/price`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ signedXdr, price }),
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error ?? "Failed to submit transaction");
  }
  return res.json();
}
