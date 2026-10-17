import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteError } from "@/components/RouteStatus";

describe("RouteError", () => {
  it("hands unrelated errors to the app-level error boundary", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<p>app boundary</p>}>
        <RouteError error={new Error("boom")} reset={vi.fn()} info={undefined} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("app boundary")).toBeInTheDocument();
    expect(screen.queryByText("Could not load this page")).not.toBeInTheDocument();
  });
});
