// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIRST_SHELVES, TrendingShelves } from "../../web/src/features/community/components/TrendingShelves.js";
import { useCommunityStore } from "../../web/src/features/community/store/communityStore.js";
import { createQueryClient } from "../../web/src/lib/query/client.js";

const sticker = (id: string, category: string) => ({
  id,
  title: `T-${id}`,
  category,
  tags: [],
  createdAt: "2026-11-26T00:00:00.000Z",
  animated: true,
  stickerUrl: `/f/${id}.webp`,
  sound: { url: `/f/${id}.ogg`, durationSec: 2 },
  uses: 0,
  soundOrigin: null,
  listed: true,
  saves: 0,
  downloads: 0,
  creator: { handle: "ana", displayName: "Ana", avatar: "🦊 #fff" },
  hidden: false,
});
const CATS = ["memes", "musica", "reacciones", "gaming", "amor", "fiesta"];

beforeEach(() => useCommunityStore.getState().reset());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(data: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (u: RequestInfo | URL) =>
        new Response(JSON.stringify(String(u).includes("/trending") ? data : { available: true, connected: false }), {
          headers: { "content-type": "application/json" },
        }),
    ),
  );
  const client = createQueryClient({ success: vi.fn(), error: vi.fn() });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(TrendingShelves, { empty: createElement("p", null, "VACIO") }),
    ),
  );
}

describe("Tendencias por categoría", () => {
  it("hot row first (ranked), then the busiest categories; only a few at first, the rest on demand", async () => {
    mount({
      hot: [sticker("h1", "memes"), sticker("h2", "musica")],
      shelves: CATS.map((c) => ({ category: c, items: [sticker(`${c}1`, c)] })),
    });
    expect(await screen.findByRole("region", { name: "Lo más sonado ahora" })).toBeTruthy();
    expect(screen.getAllByText("#1")).toHaveLength(1); // ranks only in the hot row
    const shown = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(shown).toEqual(["Lo más sonado ahora", "Memes", "Música", "Reacciones", "Gaming"]);
    expect(shown).toHaveLength(1 + FIRST_SHELVES);
    fireEvent.click(screen.getByRole("button", { name: `Ver más categorías (${CATS.length - FIRST_SHELVES})` }));
    expect(screen.getAllByRole("region")).toHaveLength(1 + CATS.length);
  });

  it("«Recién agregados» right after the hot row; its «Ver todo» opens «Nuevos»", async () => {
    mount({
      hot: [sticker("h1", "memes")],
      recent: [sticker("n1", "memes")],
      shelves: [{ category: "musica", items: [sticker("u1", "musica")] }],
    });
    await screen.findByRole("region", { name: "Recién agregados" });
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual([
      "Lo más sonado ahora",
      "Recién agregados",
      "Música",
    ]);
    const shelf = screen.getByRole("region", { name: "Recién agregados" });
    fireEvent.click(shelf.querySelector("button:last-of-type") as HTMLElement);
    expect(useCommunityStore.getState().sort).toBe("new");
  });

  it("«Ver todo» opens that category's full list", async () => {
    mount({ hot: [sticker("h1", "memes")], shelves: [{ category: "musica", items: [sticker("u1", "musica")] }] });
    const shelf = await screen.findByRole("region", { name: "Música" });
    fireEvent.click(shelf.querySelector("button:last-of-type") as HTMLElement);
    expect(useCommunityStore.getState().category).toBe("musica");
  });

  it("cards: one clear primary action and the others with VISIBLE labels (not guess-the-icon)", async () => {
    mount({ hot: [sticker("h1", "memes")], shelves: [] });
    await screen.findByText("T-h1");
    expect(screen.getByRole("button", { name: /Enviar «T-h1» a mi WhatsApp|en pausa/ })).toBeTruthy();
    for (const label of ["Favorito", "Usar", "Más"]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByLabelText("Usar este sonido en mi clip")).toBeTruthy();
    // ★ «Favorito» (WhatsApp's own word): a toggle, its state in aria-pressed.
    const fav = screen.getByRole("button", { name: "Favorito" });
    expect(fav.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(fav);
    expect((await screen.findByRole("button", { name: "Favorito", pressed: true })).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("nothing published yet → the feed's own empty state", async () => {
    mount({ hot: [], shelves: [] });
    expect(await screen.findByText("VACIO")).toBeTruthy();
  });
});
