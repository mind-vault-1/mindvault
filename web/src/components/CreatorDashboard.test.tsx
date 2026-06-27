import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatorDashboard, type DashboardResource } from "./CreatorDashboard.js";
import { fetchMyResources } from "../api/resources.js";

vi.mock("../api/resources.js", () => ({
  fetchMyResources: vi.fn(),
}));

function resource(overrides: Partial<DashboardResource> = {}): DashboardResource {
  return {
    id: "1",
    title: "Atlas of Stellar Networks",
    price: "5.00",
    resourceType: "file",
    walletAddress: "GABC",
    verificationStatus: "verified",
    onchainStatus: "registered",
    listed: true,
    accessUrl: "https://example.com/resource/1",
    ...overrides,
  };
}

function renderDashboard() {
  const onEditPrice = vi.fn();
  const onTransferOwnership = vi.fn();
  const onRegister = vi.fn();
  render(
    <CreatorDashboard
      apiKey="test-key"
      onEditPrice={onEditPrice}
      onTransferOwnership={onTransferOwnership}
      onRegister={onRegister}
    />,
  );
  return { onEditPrice, onTransferOwnership, onRegister };
}

describe("CreatorDashboard", () => {
  beforeEach(() => {
    vi.mocked(fetchMyResources).mockReset();
  });

  it("shows the empty state when the creator has no resources", async () => {
    vi.mocked(fetchMyResources).mockResolvedValue([]);

    renderDashboard();

    expect(await screen.findByText("No resources yet")).toBeInTheDocument();
  });

  it("renders owned resources with their verification, on-chain, and listing state", async () => {
    vi.mocked(fetchMyResources).mockResolvedValue([resource()]);

    renderDashboard();

    expect(await screen.findByText("Atlas of Stellar Networks")).toBeInTheDocument();
    expect(screen.getByText("5.00 USDC")).toBeInTheDocument();
    expect(screen.getByText("verified")).toBeInTheDocument();
    expect(screen.getByText("registered")).toBeInTheDocument();
    expect(screen.getByText("listed")).toBeInTheDocument();
  });

  it("shows a Register entry point only when verified but not yet on-chain", async () => {
    vi.mocked(fetchMyResources).mockResolvedValue([
      resource({ id: "needs-register", onchainStatus: "none" }),
    ]);

    renderDashboard();

    expect(await screen.findByRole("button", { name: "Register" })).toBeInTheDocument();
  });

  it("calls onEditPrice and onTransferOwnership with the selected resource", async () => {
    vi.mocked(fetchMyResources).mockResolvedValue([resource()]);
    const { onEditPrice, onTransferOwnership } = renderDashboard();

    await userEvent.click(await screen.findByRole("button", { name: "Edit price" }));
    expect(onEditPrice).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));

    await userEvent.click(screen.getByRole("button", { name: "Transfer" }));
    expect(onTransferOwnership).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
  });
});
