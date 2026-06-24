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
