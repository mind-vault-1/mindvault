import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentStatusPage } from "./AgentStatusPage.js";
import { fetchAgentStatus } from "../api/agent.js";

vi.mock("../api/agent.js", () => ({
  fetchAgentStatus: vi.fn(),
}));

const mockStatus = {
  agent: {
    name: "MindVault Verification Agent",
    walletAddress: "GBAGENT000000000000000000000000000000000000000000000000",
    network: "testnet",
    endpoint: "https://api.example.com/verify-content",
    pricePerVerification: "0.10",
    currency: "USDC",
    status: "active",
  },
  stats: {
    totalVerifications: 12,
    verified: 9,
    rejected: 3,
    totalEarned: "1.2000",
    avgConfidence: "0.88",
  },
  recentActivity: [
    {
      id: "v1",
      resourceTitle: "Atlas of Stellar Networks",
      isOriginal: true,
      confidence: 0.92,
      flags: [],
      checkedAt: "2026-06-24T12:00:00.000Z",
    },
  ],
};

describe("AgentStatusPage (#221)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading state, then renders agent stats", async () => {
    vi.mocked(fetchAgentStatus).mockResolvedValue(mockStatus);
    render(<AgentStatusPage />);

    expect(screen.getByText(/loading agent status/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Verifications processed")).toBeInTheDocument());
    expect(screen.getByText("12")).toBeInTheDocument(); // processed
    expect(screen.getByText("9")).toBeInTheDocument(); // approved
    expect(screen.getByText("3")).toBeInTheDocument(); // rejected
    expect(screen.getByText("1.2000")).toBeInTheDocument(); // USDC earned
    expect(screen.getByText("Atlas of Stellar Networks")).toBeInTheDocument();
  });

  it("renders an empty activity state when there are no verifications", async () => {
    vi.mocked(fetchAgentStatus).mockResolvedValue({
      ...mockStatus,
      stats: { ...mockStatus.stats, totalVerifications: 0, verified: 0, rejected: 0 },
      recentActivity: [],
    });
    render(<AgentStatusPage />);

    await waitFor(() => expect(screen.getByText(/no verifications yet/i)).toBeInTheDocument());
  });

  it("shows an error state with retry when the request fails", async () => {
    vi.mocked(fetchAgentStatus).mockRejectedValue(new Error("network down"));
    render(<AgentStatusPage />);

    await waitFor(() => expect(screen.getByText(/network down/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
