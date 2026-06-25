import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.js";
import { fetchCatalog, fetchRegistryStatus } from "./api/resources.js";
import type { CatalogFilters } from "./api/resources.js";

vi.mock("./api/resources.js", () => ({
  fetchCatalog: vi.fn(),
  fetchMyResources: vi.fn(),
  fetchRegistryStatus: vi.fn(),
}));

function resource(overrides: Partial<Record<string, unknown>> = {}) {
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

const mockResource = resource();

describe("App catalog empty states", () => {
  beforeEach(() => {
    vi.mocked(fetchRegistryStatus).mockResolvedValue({ resourceCount: 0 });
  });

  it("shows the catalog-is-empty state when no resources are returned", async () => {
    vi.mocked(fetchCatalog).mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByText("The catalog is empty")).toBeInTheDocument();
    expect(screen.getByText(/No resources have been published yet/)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Publish a resource/ });
    expect(cta).toHaveAttribute("href", "https://docs.mindvault.app/publishing");
  });

  it("shows the no-matches state when filters exclude every resource", async () => {
    vi.mocked(fetchCatalog).mockImplementation(async (filters?: CatalogFilters) => {
      if (filters?.search) return [];
      return [mockResource];
    });

    render(<App />);

    const search = await screen.findByLabelText("Search resources");
    await userEvent.type(search, "nonexistent-title");

    expect(await screen.findByText(/No resources match your filters\./)).toBeInTheDocument();
    expect(screen.queryByText("The catalog is empty")).not.toBeInTheDocument();
  });

  it("clearing filters from the no-matches state restores the resource list", async () => {
    vi.mocked(fetchCatalog).mockImplementation(async (filters?: CatalogFilters) => {
      if (filters?.search) return [];
      return [mockResource];
    });

    render(<App />);

    const search = await screen.findByLabelText("Search resources");
    await userEvent.type(search, "nonexistent-title");
    const emptyState = await screen.findByText(/No resources match your filters\./);

    await userEvent.click(
      within(emptyState.parentElement!).getByRole("button", { name: "Clear filters" }),
    );

    await waitFor(() => {
      expect(screen.queryByText(/No resources match your filters\./)).not.toBeInTheDocument();
    });
    expect(screen.getByText("Atlas of Stellar Networks")).toBeInTheDocument();
  });
});
