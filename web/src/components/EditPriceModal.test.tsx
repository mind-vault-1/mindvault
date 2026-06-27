import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditPriceModal } from "./EditPriceModal.js";
import { useEditPrice } from "../hooks/useEditPrice.js";

vi.mock("../hooks/useEditPrice.js", () => ({
  useEditPrice: vi.fn(),
}));

describe("EditPriceModal", () => {
  const onClose = vi.fn();
  const onConfirmed = vi.fn();
  const mockEditPrice = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useEditPrice).mockReturnValue({
      status: "idle",
      newPrice: null,
      error: null,
      networkWarning: null,
      editPrice: mockEditPrice,
    });
  });

  it("renders with labeled price input and current value", () => {
    render(
      <EditPriceModal
        resourceId="res-1"
        currentPrice="2.50"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    expect(screen.getByRole("heading", { name: /edit price/i })).toBeInTheDocument();
    const input = screen.getByLabelText(/new price/i);
    expect(input).toHaveValue(2.5);
    expect(screen.getByRole("button", { name: /update price/i })).toBeInTheDocument();
  });

  it("submits new price on happy path", async () => {
    const user = userEvent.setup();
    render(
      <EditPriceModal
        resourceId="res-1"
        currentPrice="2.50"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    const input = screen.getByLabelText(/new price/i);
    await user.clear(input);
    await user.type(input, "3.00");
    await user.click(screen.getByRole("button", { name: /update price/i }));

    expect(mockEditPrice).toHaveBeenCalledWith("3");
  });

  it("shows in-progress status labels", () => {
    vi.mocked(useEditPrice).mockReturnValue({
      status: "signing",
      newPrice: null,
      error: null,
      networkWarning: null,
      editPrice: mockEditPrice,
    });

    render(
      <EditPriceModal
        resourceId="res-1"
        currentPrice="2.50"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    expect(screen.getByText(/waiting for wallet signature/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /working/i })).toBeDisabled();
  });

  it("shows error state", () => {
    vi.mocked(useEditPrice).mockReturnValue({
      status: "error",
      newPrice: null,
      error: "Wallet rejected signing",
      networkWarning: null,
      editPrice: mockEditPrice,
    });

    render(
      <EditPriceModal
        resourceId="res-1"
        currentPrice="2.50"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    expect(screen.getByText("Wallet rejected signing")).toBeInTheDocument();
  });

  it("calls onConfirmed when price is updated", async () => {
    vi.mocked(useEditPrice).mockReturnValue({
      status: "confirmed",
      newPrice: "4.00",
      error: null,
      networkWarning: null,
      editPrice: mockEditPrice,
    });

    render(
      <EditPriceModal
        resourceId="res-1"
        currentPrice="2.50"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    await waitFor(() => {
      expect(onConfirmed).toHaveBeenCalledWith("4.00");
    });
    expect(screen.getByText(/price updated to 4\.00 usdc/i)).toBeInTheDocument();
  });

  it("closes when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(
      <EditPriceModal
        resourceId="res-1"
        currentPrice="2.50"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
