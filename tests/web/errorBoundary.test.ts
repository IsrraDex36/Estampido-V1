// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isChunkError } from "../../web/src/app/errors.js";
import { RouteErrorBoundary } from "../../web/src/app/RouteErrorBoundary.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let shouldThrow: Error | null = null;
function Page() {
  if (shouldThrow) throw shouldThrow;
  return createElement("p", null, "contenido ok");
}

describe("RouteErrorBoundary", () => {
  it("a crashing page shows a recoverable fallback instead of a blank app", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    shouldThrow = new Error("boom");
    render(createElement(RouteErrorBoundary, null, createElement(Page)));
    expect(screen.getByRole("alert").textContent).toContain("Esta página tuvo un problema");

    shouldThrow = null; // fixed (e.g. transient) → «Reintentar» re-renders the page
    fireEvent.click(screen.getByText("Reintentar"));
    expect(screen.getByText("contenido ok")).toBeTruthy();
  });

  it("a lazy chunk that failed to download gets its own message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    shouldThrow = new TypeError("Failed to fetch dynamically imported module: /assets/CommunityPage-x.js");
    render(createElement(RouteErrorBoundary, null, createElement(Page)));
    expect(screen.getByRole("alert").textContent).toContain("No se pudo cargar esta sección");
    shouldThrow = null;
  });

  it("isChunkError recognizes browser variants", () => {
    expect(isChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkError(new Error("ChunkLoadError: x"))).toBe(true);
    expect(isChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
  });
});
