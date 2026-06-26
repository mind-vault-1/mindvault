import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PurchaseConfirmModal, type PurchaseResource } from "./PurchaseConfirmModal.js";

const resource: PurchaseResource = {
  id: "1",
  title: "Atlas of Stellar Networks",
  price: "5.00",
  walletAddress: "GCREATORWALLETADDRESS",
  accessUrl: "https://example.com/resources/1",
};

describe("PurchaseConfirmModal", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("open", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows title, price, recipient wallet, and network before signing", () => {
    render(<PurchaseConfirmModal resource={resource} onClose={vi.fn()} />);

    expect(screen.getByText("Atlas of Stellar Networks")).toBeInTheDocument();
    expect(screen.getByText("5.00 USDC")).toBeInTheDocument();
    expect(screen.getByText("GCREATORWALLETADDRESS")).toBeInTheDocument();
    expect(screen.getByText("Stellar Testnet")).toBeInTheDocument();
  });

  it("shows a success state with an explorer link when payment succeeds", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", "X-Payment-Id": "pay_1" }),
      json: async () => ({ receipt: { paymentId: "tx_abc123" } }),
    } as Response);

    render(<PurchaseConfirmModal resource={resource} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Pay with wallet" }));

    expect(await screen.findByText("Payment received")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View on Stellar Explorer/ })).toHaveAttribute(
      "href",
      expect.stringContaining("tx_abc123"),
    );
  });

  it("shows a failure state when the request errors", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({ error: "Something went wrong" }),
    } as Response);

    render(<PurchaseConfirmModal resource={resource} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Pay with wallet" }));

    expect(await screen.findByText("Purchase not complete")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("opens the resource URL and explains next steps on a 402 response", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 402,
      headers: new Headers(),
      json: async () => ({}),
    } as Response);

    render(<PurchaseConfirmModal resource={resource} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Pay with wallet" }));

    expect(await screen.findByText("Purchase not complete")).toBeInTheDocument();
    expect(window.open).toHaveBeenCalledWith(resource.accessUrl, "_blank", "noopener,noreferrer");
  });
});
