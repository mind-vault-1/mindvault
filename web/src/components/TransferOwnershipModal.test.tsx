import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TransferOwnershipModal } from "./TransferOwnershipModal.js";
import { useTransferOwnership } from "../hooks/useTransferOwnership.js";

vi.mock("../hooks/useTransferOwnership.js", () => ({
  useTransferOwnership: vi.fn(),
}));

describe("TransferOwnershipModal", () => {
  const onClose = vi.fn();
  const onConfirmed = vi.fn();
  const mockTransfer = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTransferOwnership).mockReturnValue({
      status: "idle",
      newOwner: null,
      error: null,
      networkWarning: null,
      transferOwnership: mockTransfer,
    });
  });

  it("renders with labeled owner address input", () => {
    render(
      <TransferOwnershipModal
        resourceId="res-1"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    expect(screen.getByRole("heading", { name: /transfer ownership/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/new owner address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^transfer$/i })).toBeDisabled();
  });

  it("submits new owner on happy path", async () => {
    const user = userEvent.setup();
    render(
      <TransferOwnershipModal
        resourceId="res-1"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    await user.type(screen.getByLabelText(/new owner address/i), "GNEWOWNER123");
    await user.click(screen.getByRole("button", { name: /^transfer$/i }));

    expect(mockTransfer).toHaveBeenCalledWith("GNEWOWNER123");
  });

  it("shows in-progress status labels", () => {
    vi.mocked(useTransferOwnership).mockReturnValue({
      status: "submitting",
      newOwner: null,
      error: null,
      networkWarning: null,
      transferOwnership: mockTransfer,
    });

    render(
      <TransferOwnershipModal
        resourceId="res-1"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    expect(screen.getByText(/submitting to stellar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /working/i })).toBeDisabled();
  });

  it("shows error state", () => {
    vi.mocked(useTransferOwnership).mockReturnValue({
      status: "error",
      newOwner: null,
      error: "Invalid Stellar address",
      networkWarning: null,
      transferOwnership: mockTransfer,
    });

    render(
      <TransferOwnershipModal
        resourceId="res-1"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    expect(screen.getByText("Invalid Stellar address")).toBeInTheDocument();
  });

  it("calls onConfirmed when transfer succeeds", async () => {
    vi.mocked(useTransferOwnership).mockReturnValue({
      status: "confirmed",
      newOwner: "GNEWOWNER123",
      error: null,
      networkWarning: null,
      transferOwnership: mockTransfer,
    });

    render(
      <TransferOwnershipModal
        resourceId="res-1"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    await waitFor(() => {
      expect(onConfirmed).toHaveBeenCalledWith("GNEWOWNER123");
    });
    expect(screen.getByText(/ownership transferred to gnewowner123/i)).toBeInTheDocument();
  });

  it("closes when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(
      <TransferOwnershipModal
        resourceId="res-1"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
