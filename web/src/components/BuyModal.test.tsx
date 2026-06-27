import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BuyModal } from "./BuyModal.js";
import { useBuyResource } from "../hooks/useBuyResource.js";

vi.mock("../hooks/useBuyResource.js", () => ({
  useBuyResource: vi.fn(),
}));

const defaultProps = {
  resourceTitle: "Premium Dataset",
  price: "1.50",
  recipient: "GBUYER1234567890",
  accessUrl: "https://api.example.com/resources/abc",
  onClose: vi.fn(),
  onCopyUrl: vi.fn(),
};

describe("BuyModal", () => {
  const mockBuy = vi.fn();
  const mockReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBuyResource).mockReturnValue({
      status: "idle",
      result: null,
      error: null,
      buy: mockBuy,
      reset: mockReset,
    });
  });

  it("renders confirm step with resource details and disabled pay without wallet", () => {
    render(<BuyModal {...defaultProps} walletAddress={null} />);

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: /buy resource/i })).toBeInTheDocument();
    expect(screen.getByText("Premium Dataset")).toBeInTheDocument();
    expect(screen.getByText("1.50 USDC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay 1\.50 usdc/i })).toBeDisabled();
    expect(screen.getByText(/connect your freighter wallet/i)).toBeInTheDocument();
  });

  it("starts purchase when wallet is connected and pay is clicked", async () => {
    const user = userEvent.setup();
    render(<BuyModal {...defaultProps} walletAddress="GWALLET123" />);

    await user.click(screen.getByRole("button", { name: /pay 1\.50 usdc/i }));
    expect(mockBuy).toHaveBeenCalledWith(defaultProps.accessUrl);
  });

  it("shows paying state and blocks close while payment is in flight", async () => {
    vi.mocked(useBuyResource).mockReturnValue({
      status: "paying",
      result: null,
      error: null,
      buy: mockBuy,
      reset: mockReset,
    });

    const user = userEvent.setup();
    render(<BuyModal {...defaultProps} walletAddress="GWALLET123" />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("shows success state with explorer link", () => {
    vi.mocked(useBuyResource).mockReturnValue({
      status: "success",
      result: {
        url: "https://example.com/resource",
        explorerUrl: "https://stellar.expert/explorer/testnet/tx/abc",
      },
      error: null,
      buy: mockBuy,
      reset: mockReset,
    });

    render(<BuyModal {...defaultProps} walletAddress="GWALLET123" />);

    expect(screen.getByText(/payment successful/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open resource/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view transaction on stellar explorer/i }),
    ).toHaveAttribute("href", "https://stellar.expert/explorer/testnet/tx/abc");
  });

  it("shows error state with retry", async () => {
    vi.mocked(useBuyResource).mockReturnValue({
      status: "error",
      result: null,
      error: "Wallet rejected the payment",
      buy: mockBuy,
      reset: mockReset,
    });

    const user = userEvent.setup();
    render(<BuyModal {...defaultProps} walletAddress="GWALLET123" />);

    expect(screen.getByText("Wallet rejected the payment")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(mockBuy).toHaveBeenCalledWith(defaultProps.accessUrl);
  });

  it("closes on backdrop click and restores focus behavior via close button", async () => {
    const user = userEvent.setup();

    const Trigger = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open Buy</button>
          {open && (
            <BuyModal {...defaultProps} walletAddress="GWALLET123" onClose={() => setOpen(false)} />
          )}
        </div>
      );
    };

    render(<Trigger />);
    const trigger = screen.getByRole("button", { name: /open buy/i });
    await user.click(trigger);

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(mockReset).toHaveBeenCalled();
  });

  it("copies access URL via fallback button", async () => {
    const user = userEvent.setup();
    const onCopyUrl = vi.fn();
    render(<BuyModal {...defaultProps} walletAddress={null} onCopyUrl={onCopyUrl} />);

    await user.click(screen.getByRole("button", { name: /copy access url instead/i }));
    expect(onCopyUrl).toHaveBeenCalledWith(defaultProps.accessUrl);
  });
});
