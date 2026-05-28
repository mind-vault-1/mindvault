const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function fetchMyResources(apiKey: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/publishers/me/resources`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) throw new Error("Failed to fetch your resources");
  return res.json();
}

export async function registerOnChain(resourceId: string, apiKey: string): Promise<{ id: string; onchainStatus: string }> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/register`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error ?? "Registration failed");
  }
  return res.json();
}

export async function prepareSetPrice(
  resourceId: string,
  price: string,
  apiKey: string
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

export async function submitSetPrice(
  resourceId: string,
  signedXdr: string,
  price: string,
  apiKey: string
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
