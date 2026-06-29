import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CatalogSearch } from "./CatalogSearch.js";
import type { CatalogFilters } from "../api/resources.js";

function renderComponent(filters: CatalogFilters = {}) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  render(
    <CatalogSearch
      filters={filters}
      total={10}
      filtered={10}
      onChange={onChange}
      onReset={onReset}
    />,
  );
  return { onChange, onReset };
}

describe("CatalogSearch", () => {
  it("emits updated filters when the search input changes", async () => {
    const { onChange } = renderComponent();
    const input = screen.getByLabelText("Search resources");

    await userEvent.type(input, "a");

    expect(onChange).toHaveBeenCalledWith({ search: "a" });
  });

  it("emits updated filters when the minimum price input changes", async () => {
    const { onChange } = renderComponent();
    const input = screen.getByLabelText("Minimum price in USDC");

    await userEvent.type(input, "5");

    expect(onChange).toHaveBeenCalledWith({ minPrice: "5" });
  });

  it("emits updated filters when the maximum price input changes", async () => {
    const { onChange } = renderComponent();
    const input = screen.getByLabelText("Maximum price in USDC");

    await userEvent.type(input, "9");

    expect(onChange).toHaveBeenCalledWith({ maxPrice: "9" });
  });

  it("emits updated filters when the verification status select changes", async () => {
    const { onChange } = renderComponent();
    const select = screen.getByLabelText("Filter by verification status");

    await userEvent.selectOptions(select, "verified");

    expect(onChange).toHaveBeenCalledWith({ verificationStatus: "verified" });
  });

  it("emits updated filters when the resource type select changes", async () => {
    const { onChange } = renderComponent();
    const select = screen.getByLabelText("Filter by resource type");

    await userEvent.selectOptions(select, "file");

    expect(onChange).toHaveBeenCalledWith({ resourceType: "file" });
  });

  it("calls onReset when the reset action is clicked", async () => {
    const { onReset } = renderComponent({ search: "draft" });

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("hides the reset action when there are no active filters", () => {
    renderComponent();

    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("shows the reset action once a filter is active", () => {
    renderComponent({ resourceType: "link" });

    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("exposes accessible labels for all filter controls", () => {
    renderComponent();

    expect(screen.getByLabelText("Search resources")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by verification status")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by resource type")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimum price in USDC")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximum price in USDC")).toBeInTheDocument();
  });

  it("shows the filtered count out of total when filters are active", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    render(
      <CatalogSearch
        filters={{ search: "draft" }}
        total={10}
        filtered={3}
        onChange={onChange}
        onReset={onReset}
      />,
    );

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/of/)).toBeInTheDocument();
  });
});

// ── Keyboard navigation (#311) ──────────────────────────────────────────────

const sampleResults = [
  { id: "r1", title: "Introduction to Stellar", subtitle: "$5.00 USDC" },
  { id: "r2", title: "Advanced Soroban", subtitle: "$15.00 USDC" },
  { id: "r3", title: "Stellar Basics", subtitle: "$2.50 USDC" },
];

function renderWithResults() {
  const onChange = vi.fn();
  const onReset = vi.fn();
  const onActivate = vi.fn();
  render(
    <CatalogSearch
      filters={{ search: "Stellar" }}
      total={3}
      filtered={3}
      onChange={onChange}
      onReset={onReset}
      results={sampleResults}
      onActivate={onActivate}
    />,
  );
  return { onChange, onReset, onActivate };
}

describe("CatalogSearch – keyboard navigation", () => {
  it("renders results as a listbox when results are provided", () => {
    renderWithResults();
    const listbox = screen.getByRole("listbox", { name: "Search results" });
    expect(listbox).toBeInTheDocument();
    // Query options within the listbox only, not from the select elements.
    const { getAllByRole: getAllByRoleInListbox } = {
      getAllByRole: (role: string) => Array.from(listbox.querySelectorAll(`[role="${role}"]`)),
    };
    expect(getAllByRoleInListbox("option")).toHaveLength(3);
  });

  it("marks the search input as a combobox with expanded state", () => {
    renderWithResults();
    const input = screen.getByRole("combobox", { name: "Search resources" });
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("navigates down through results with ArrowDown", async () => {
    renderWithResults();
    const input = screen.getByRole("combobox", { name: "Search resources" });
    input.focus();

    await userEvent.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowDown}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("wraps from last to first on ArrowDown", async () => {
    renderWithResults();
    const input = screen.getByRole("combobox", { name: "Search resources" });
    input.focus();

    // Navigate to the last item
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(options[2]).toHaveAttribute("aria-selected", "true");

    // One more should wrap to first
    await userEvent.keyboard("{ArrowDown}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("navigates up with ArrowUp, wrapping from first to last", async () => {
    renderWithResults();
    const input = screen.getByRole("combobox", { name: "Search resources" });
    input.focus();

    // ArrowUp from no selection should go to last
    await userEvent.keyboard("{ArrowUp}");
    const options = screen.getAllByRole("option");
    expect(options[2]).toHaveAttribute("aria-selected", "true");
  });

  it("activates the focused result on Enter and calls onActivate", async () => {
    const { onActivate } = renderWithResults();
    const input = screen.getByRole("combobox", { name: "Search resources" });
    input.focus();

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(sampleResults[0]);
  });

  it("activates a result on click and calls onActivate", async () => {
    const { onActivate } = renderWithResults();
    const options = screen.getAllByRole("option");

    await userEvent.click(options[1]);

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(sampleResults[1]);
  });

  it("clears active selection on Escape", async () => {
    renderWithResults();
    const input = screen.getByRole("combobox", { name: "Search resources" });
    input.focus();

    await userEvent.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{Escape}");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("does not render a listbox when no results prop is given", () => {
    renderComponent();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows result subtitles when provided", () => {
    renderWithResults();
    expect(screen.getByText("$5.00 USDC")).toBeInTheDocument();
  });

  it("focus is visible on the active option", async () => {
    renderWithResults();
    const input = screen.getByRole("combobox", { name: "Search resources" });
    input.focus();

    await userEvent.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    // Active item should have tabIndex=0 so it can receive focus
    expect(options[0]).toHaveAttribute("tabindex", "0");
    // Non-active items should have tabIndex=-1
    expect(options[1]).toHaveAttribute("tabindex", "-1");
  });
});
