import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResourcePreviewModal } from "./ResourcePreviewModal.js";
import { fetchResourceMeta } from "../api/resources.js";

vi.mock("../api/resources.js", () => ({
  fetchResourceMeta: vi.fn(),
}));

const mockResourceMeta = {
  id: "res-1",
  title: "Test Resource",
  description: "A very nice description",
  price: "10.00",
  resourceType: "file",
  verificationStatus: "verified",
  onchainStatus: "registered",
  onchainTxHash: "0x123abc",
  accessUrl: "https://paywall.example.com/access/res-1",
  publisherName: "Alice",
  publisherWallet: "GBALICE...",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("ResourcePreviewModal", () => {
  const mockOnClose = vi.fn();
  const mockOnCopyUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state before resolving, then renders metadata", async () => {
    let resolvePromise: (val: any) => void;
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(fetchResourceMeta).mockReturnValue(fetchPromise as any);

    render(
      <ResourcePreviewModal resourceId="res-1" onClose={mockOnClose} onCopyUrl={mockOnCopyUrl} />,
    );

    // Assert loading state
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Loading preview…")).toBeInTheDocument();

    // Resolve the promise
    resolvePromise!(mockResourceMeta);

    // Await success state
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    // Check metadata
    expect(screen.getByRole("heading", { name: "Resource Preview" })).toBeInTheDocument();
    expect(screen.getByText("Test Resource")).toBeInTheDocument();
    expect(screen.getByText("by Alice")).toBeInTheDocument();
    expect(screen.getByText("A very nice description")).toBeInTheDocument();
    expect(screen.getByText("10.00 USDC")).toBeInTheDocument();
    expect(screen.getByText("file")).toBeInTheDocument();
    expect(screen.getByText("verified")).toBeInTheDocument();
    expect(screen.getByText("registered")).toBeInTheDocument();
  });

  it("shows error state on reject and retries on click", async () => {
    vi.mocked(fetchResourceMeta)
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValueOnce(mockResourceMeta);

    const user = userEvent.setup();
    render(
      <ResourcePreviewModal resourceId="res-1" onClose={mockOnClose} onCopyUrl={mockOnCopyUrl} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("Network Error")).toBeInTheDocument();

    // Click retry
    const retryBtn = screen.getByRole("button", { name: /try again/i });
    await user.click(retryBtn);

    // Verify it fetches again and succeeds
    await waitFor(() => {
      expect(fetchResourceMeta).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Test Resource")).toBeInTheDocument();
    });
  });

  it("does not fetch accessUrl automatically and only triggers copy on click", async () => {
    vi.mocked(fetchResourceMeta).mockResolvedValue(mockResourceMeta);
    const user = userEvent.setup();

    render(
      <ResourcePreviewModal resourceId="res-1" onClose={mockOnClose} onCopyUrl={mockOnCopyUrl} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Test Resource")).toBeInTheDocument();
    });

    // Assert fetchResourceMeta is the only API call
    expect(fetchResourceMeta).toHaveBeenCalledTimes(1);

    // Click the copy button
    const copyBtn = screen.getByRole("button", { name: /copy access url/i });
    await user.click(copyBtn);

    // Assert action was fired with correct URL
    expect(mockOnCopyUrl).toHaveBeenCalledWith("https://paywall.example.com/access/res-1");
    expect(mockOnCopyUrl).toHaveBeenCalledTimes(1);
  });

  it("supports accessibility and keyboard interactions", async () => {
    vi.mocked(fetchResourceMeta).mockResolvedValue(mockResourceMeta);
    const user = userEvent.setup();

    // We need a trigger button to test focus restore
    const Trigger = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open Modal</button>
          {open && (
            <ResourcePreviewModal
              resourceId="res-1"
              onClose={() => setOpen(false)}
              onCopyUrl={mockOnCopyUrl}
            />
          )}
        </div>
      );
    };

    render(<Trigger />);

    const triggerBtn = screen.getByRole("button", { name: /open modal/i });
    triggerBtn.focus();
    await user.click(triggerBtn);

    // Check dialog role and aria-modal
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    await waitFor(() => {
      expect(screen.getByText("Test Resource")).toBeInTheDocument();
    });

    // Check Escape closes modal
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Re-open
    await user.click(triggerBtn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Check Backdrop click closes modal
    // The backdrop is the parent of the dialog
    const dialogContainer = screen.getByRole("dialog").parentElement!;
    await user.click(dialogContainer);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Re-open
    await user.click(triggerBtn);
    const newDialog = screen.getByRole("dialog");

    // Click inside should not close
    await user.click(newDialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Close button works
    const closeBtn = screen.getByRole("button", { name: "Close" });
    await user.click(closeBtn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Focus restored to trigger element
    expect(document.activeElement).toBe(triggerBtn);
  });
});
