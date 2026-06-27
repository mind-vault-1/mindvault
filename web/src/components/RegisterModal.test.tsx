import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RegisterModal } from "./RegisterModal.js";
import { RegistrationError } from "../api/resources.js";

const mocks = vi.hoisted(() => ({
  prepareRegisterTx: vi.fn(),
  submitRegisterTx: vi.fn(),
}));

vi.mock("../api/resources.js", () => ({
  prepareRegisterTx: mocks.prepareRegisterTx,
  submitRegisterTx: mocks.submitRegisterTx,
  RegistrationError: class RegistrationError extends Error {
    txHash?: string;
    nextSteps?: string[];
    constructor(message: string, details: { txHash?: string; nextSteps?: string[] } = {}) {
      super(message);
      this.name = "RegistrationError";
      this.txHash = details.txHash;
      this.nextSteps = details.nextSteps;
    }
  },
}));

const mockPrepare = {
  unsignedXdr: "unsigned-xdr",
  networkPassphrase: "Test SDF Network ; September 2015",
  metadata: {
    resourceId: "res-1",
    creator: "GCREATOR",
    price: "1.00",
    title: "Test",
  },
};

describe("RegisterModal", () => {
  const onClose = vi.fn();
  const onConfirmed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareRegisterTx.mockResolvedValue(mockPrepare);
    window.freighterApi = {
      signTransaction: vi.fn().mockResolvedValue("signed-xdr"),
    } as unknown as typeof window.freighterApi;
  });

  afterEach(() => {
    delete (window as { freighterApi?: unknown }).freighterApi;
  });

  it("prepares transaction on mount and shows signing step", async () => {
    render(
      <RegisterModal
        resourceId="res-1"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    await waitFor(() => {
      expect(mocks.prepareRegisterTx).toHaveBeenCalledWith("res-1", "key-1");
    });
    expect(screen.getByText(/ready to sign transaction/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign & submit/i })).toBeInTheDocument();
  });

  it("completes registration on happy path", async () => {
    mocks.submitRegisterTx.mockResolvedValue({
      id: "res-1",
      onchainStatus: "registered",
      txHash: "tx-hash-123",
    });

    const user = userEvent.setup();
    render(
      <RegisterModal
        resourceId="res-1"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign & submit/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /sign & submit/i }));

    await waitFor(() => {
      expect(mocks.submitRegisterTx).toHaveBeenCalledWith("res-1", "signed-xdr", "key-1");
    });
    expect(screen.getByText(/registration successful/i)).toBeInTheDocument();
    expect(onConfirmed).toHaveBeenCalledWith("tx-hash-123");
  });

  it("shows error when prepare fails", async () => {
    mocks.prepareRegisterTx.mockRejectedValue(new Error("Not verified yet"));

    render(
      <RegisterModal
        resourceId="res-1"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Not verified yet")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("shows structured recovery guidance on RegistrationError", async () => {
    mocks.submitRegisterTx.mockRejectedValue(
      new RegistrationError("On-chain registration failed", {
        txHash: "failed-tx",
        nextSteps: ["Wait for confirmation", "Retry from dashboard"],
      }),
    );

    const user = userEvent.setup();
    render(
      <RegisterModal
        resourceId="res-1"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign & submit/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /sign & submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/on-chain registration failed/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Wait for confirmation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /check transaction status/i })).toBeInTheDocument();
  });

  it("closes via cancel button", async () => {
    const user = userEvent.setup();
    render(
      <RegisterModal
        resourceId="res-1"
        apiKey="key-1"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
