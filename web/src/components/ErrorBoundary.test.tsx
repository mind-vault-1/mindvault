import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary.js";

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("💥");
  return <p>all good</p>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <p>hello</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows fallback UI on uncaught error", () => {
    // Suppress error log from the caught exception
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/Try reloading the page/)).toBeInTheDocument();
  });

  it("calls onError when provided", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));
  });

  it("renders custom fallback when provided", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
  });

  it("reload button resets error state with non-throwing child", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    function Controlled() {
      const [throwErr, setThrowErr] = React.useState(true);
      return (
        <>
          <button onClick={() => setThrowErr(false)}>Fix it</button>
          <ErrorBoundary>
            <Bomb shouldThrow={throwErr} />
          </ErrorBoundary>
        </>
      );
    }

    const user = userEvent.setup();
    render(<Controlled />);

    await screen.findByText("Something went wrong");

    // Fix the error source first, THEN reload
    await user.click(screen.getByRole("button", { name: "Fix it" }));
    await user.click(screen.getByRole("button", { name: "Reload" }));

    expect(await screen.findByText("all good")).toBeInTheDocument();
  });
});
