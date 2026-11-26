// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkDialog } from "../../web/src/features/bot/LinkDialog.js";
import { createQueryClient } from "../../web/src/lib/query/client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount(createStatus: () => number) {
  const posts: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.includes("/api/whatsapp/status"))
        return json({ available: true, connected: true, botNumber: "5215500000000" });
      if (url.includes("/api/whatsapp/link") && init?.method === "POST") {
        const status = createStatus();
        posts.push(status);
        return status === 200
          ? json({ state: "pending", code: "EST-AB2CD", expiresAt: Date.now() + 600_000, waLink: "https://wa.me/1" })
          : json({ error: { code: "rate_limited", message: "Demasiadas solicitudes." } }, status);
      }
      if (url.includes("/api/whatsapp/link")) return json({ state: "unlinked" });
      if (url.includes("/api/me")) return json({ error: { code: "unauthorized", message: "x" } }, 401);
      return json({});
    }),
  );
  const client = createQueryClient({ success: vi.fn(), error: vi.fn() });
  client.setDefaultOptions({ queries: { retry: false } });
  render(
    createElement(QueryClientProvider, { client }, createElement(LinkDialog, { open: true, onOpenChange: () => {} })),
  );
  return posts;
}

describe("«Entra con tu WhatsApp» dialog", () => {
  it("asks for a code once; a refusal (429) shows «Reintentar» instead of retrying in a loop", async () => {
    let status = 429;
    const posts = mount(() => status);
    await screen.findByText("No pudimos generar tu código");
    expect(screen.getByText(/Muchas personas entrando a la vez/)).toBeTruthy();
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(posts).toEqual([429]); // no hammering
    status = 200;
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByLabelText("Código EST-AB2CD")).toBeTruthy());
    expect(posts).toEqual([429, 200]);
    expect(screen.getByRole("link", { name: /Abrir WhatsApp/ })).toBeTruthy();
  });
});
