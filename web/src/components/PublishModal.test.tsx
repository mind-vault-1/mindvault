import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublishModal } from "./PublishModal.js";
import { publishLinkResource } from "../api/resources.js";

vi.mock("../api/resources.js", () => ({
  publishLinkResource: vi.fn(),
  publishFileResource: vi.fn(),
}));

describe("PublishModal", () => {
  const onClose = vi.fn();
  const onPublished = vi.fn();
  const apiKey = "test-api-key";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the publish form with required fields", () => {
    render(<PublishModal apiKey={apiKey} onClose={onClose} onPublished={onPublished} />);

    expect(screen.getByRole("heading", { name: /publish a resource/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/external url/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("publishes a link resource on happy path", async () => {
    vi.mocked(publishLinkResource).mockResolvedValue({ id: "res-1" });
    const user = userEvent.setup();

    render(<PublishModal apiKey={apiKey} onClose={onClose} onPublished={onPublished} />);

    await user.type(screen.getByLabelText(/title/i), "My Dataset");
    await user.type(screen.getByLabelText(/price/i), "0.50");
    await user.type(screen.getByLabelText(/external url/i), "https://example.com/data.csv");
    await user.click(screen.getByRole("button", { name: /^publish$/i }));

    await waitFor(() => {
      expect(publishLinkResource).toHaveBeenCalledWith(
        {
          title: "My Dataset",
          description: undefined,
          price: "0.50",
          externalUrl: "https://example.com/data.csv",
        },
        apiKey,
      );
    });

    expect(screen.getByText(/published!/i)).toBeInTheDocument();
    expect(onPublished).toHaveBeenCalled();
  });

  it("shows error state when publish fails", async () => {
    vi.mocked(publishLinkResource).mockRejectedValue(new Error("API rate limited"));
    const user = userEvent.setup();

    render(<PublishModal apiKey={apiKey} onClose={onClose} onPublished={onPublished} />);

    await user.type(screen.getByLabelText(/title/i), "My Dataset");
    await user.type(screen.getByLabelText(/price/i), "0.50");
    await user.type(screen.getByLabelText(/external url/i), "https://example.com/data.csv");
    await user.click(screen.getByRole("button", { name: /^publish$/i }));

    await waitFor(() => {
      expect(screen.getByText(/api rate limited/i)).toBeInTheDocument();
    });
    expect(onPublished).not.toHaveBeenCalled();
  });

  it("closes when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<PublishModal apiKey={apiKey} onClose={onClose} onPublished={onPublished} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("switches to file upload mode and shows the file input", async () => {
    const user = userEvent.setup();

    render(<PublishModal apiKey={apiKey} onClose={onClose} onPublished={onPublished} />);

    expect(screen.getByLabelText(/external url/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /file upload/i }));

    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
    expect(screen.queryByLabelText(/external url/i)).not.toBeInTheDocument();
  });
});
