const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface AgentActivity {
  id: string;
  resourceTitle: string;
  isOriginal: boolean;
  confidence: number;
  flags: string[];
  checkedAt: string;
}

export interface AgentStatus {
  agent: {
    name: string;
    walletAddress: string;
    network: string;
    endpoint: string;
    pricePerVerification: string;
    currency: string;
    status: string;
  };
  stats: {
    totalVerifications: number;
    verified: number;
    rejected: number;
    totalEarned: string;
    avgConfidence: string;
  };
  recentActivity: AgentActivity[];
}

/** Fetch public verification-agent stats from `GET /agent/status` (issue #221). */
export async function fetchAgentStatus(signal?: AbortSignal): Promise<AgentStatus> {
  const res = await fetch(`${API_BASE}/agent/status`, { signal });
  if (!res.ok) throw new Error("Failed to load agent status");
  return res.json();
}
