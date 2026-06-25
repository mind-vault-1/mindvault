const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface PaymentReceipt {
  id: string;
  resourceId: string;
  resourceTitle: string | null;
  amount: string;
  currency: string;
  payerAddress: string;
  recipientAddress: string;
  paidAt: string;
}

export async function fetchPaymentReceipt(id: string): Promise<PaymentReceipt> {
  const res = await fetch(`${API_BASE}/payments/${id}`);
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: undefined }));
    throw new Error(error ?? "Failed to load receipt");
  }
  return res.json();
}

export async function fetchPaymentHistory(payerAddress: string): Promise<PaymentReceipt[]> {
  const res = await fetch(`${API_BASE}/payments?payer=${encodeURIComponent(payerAddress)}`);
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: undefined }));
    throw new Error(error ?? "Failed to load purchase history");
  }
  return res.json();
}
