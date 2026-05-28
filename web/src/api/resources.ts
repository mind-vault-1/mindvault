const API_BASE = import.meta.env.VITE_API_URL ?? "";

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

export async function fetchRegistryStatus(): Promise<{ resourceCount: number }> {
  const res = await fetch(`${API_BASE}/registry/status`);
  if (!res.ok) throw new Error("Failed to fetch registry status");
  return res.json();
}

export async function prepareTransferOwnership(
  resourceId: string,
  newCreator: string,
  apiKey: string
): Promise<{ unsignedXdr: string; networkPassphrase: string }> {
  const res = await fetch(
    `${API_BASE}/resources/${resourceId}/ownership/prepare`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ newCreator }),
    }
  );
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
  apiKey: string
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
