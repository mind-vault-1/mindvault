const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface RecentPayment {
  payerAddress: string;
  amount: string;
  paidAt: string;
}

export interface ResourceStat {
  id: string;
  title: string;
  price: string;
  accessUrl: string;
  verificationStatus: string;
  listed: boolean;
  createdAt: string;
  totalSales: number;
  totalEarned: string;
  recentPayments: RecentPayment[];
}

export interface AnalyticsData {
  summary: {
    totalEarned: string;
    currency: string;
    totalSales: number;
    totalResources: number;
    listedResources: number;
    verification: { verified: number; rejected: number; pending: number };
  };
  resources: ResourceStat[];
}

export async function fetchAnalytics(apiKey: string): Promise<AnalyticsData> {
  const res = await fetch(`${API_BASE}/publishers/me/analytics`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) throw new Error("Failed to load analytics");
  return res.json();
}
