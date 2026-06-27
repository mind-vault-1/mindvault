const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface PaymentReceipt {
  id: string;
  resourceId: string;
  amount: string;
  payerAddress: string;
  recipientAddress: string;
  paidAt: string;
}

export async function fetchReceipt(paymentId: string): Promise<PaymentReceipt> {
  const res = await fetch(`${API_BASE}/payments/${paymentId}/receipt`);
  if (!res.ok) throw new Error("Failed to load receipt");
  return res.json();
}

export async function fetchBuyerPayments(address: string): Promise<PaymentReceipt[]> {
  const res = await fetch(`${API_BASE}/buyers/${address}/payments`);
  if (!res.ok) throw new Error("Failed to load buyer payments");
  return res.json();
}
