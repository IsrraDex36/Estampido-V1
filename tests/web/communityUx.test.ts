// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Feed } from "../../web/src/features/community/components/Feed.js";
import { Ranking } from "../../web/src/features/community/components/Ranking.js";
import { useCommunityStore } from "../../web/src/features/community/store/communityStore.js";
import { createQueryClient } from "../../web/src/lib/query/client.js";

const sticker = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `T-${id}`,
  category: "reacciones",
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
  ...extra,
});

function mount(el: ReturnType<typeof createElement>, pages: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: RequestInfo | URL) => {
      const url = String(u);
      const key = Object.keys(pages).find((k) => url.includes(k));
      return new Response(JSON.stringify(key ? pages[key] : { available: true, connected: false, me: null }), {
        headers: { "content-type": "application/json" },
      });
    }),
  );
  const client = createQueryClient({ success: vi.fn(), error: vi.fn() });
  render(createElement(QueryClientProvider, { client }, el));
}

beforeEach(() => useCommunityStore.getState().reset());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("filters you can see and undo", () => {
  it("an active category and search show as chips; tapping one removes just that filter", async () => {
    useCommunityStore.getState().toggleCategory("reacciones");
    useCommunityStore.getState().setQuery("gato");
    mount(createElement(Feed), { "/api/community/stickers": { items: [sticker("a")], nextCursor: null } });
    const cat = await screen.findByRole("button", { name: /Quitar filtro 😮 Reacciones/ });
    expect(screen.getByRole("button", { name: /Quitar filtro «gato»/ })).toBeTruthy();
    fireEvent.click(cat);
    expect(useCommunityStore.getState().category).toBeNull();
    expect(useCommunityStore.getState().query).toBe("gato");
    fireEvent.click(screen.getByRole("button", { name: "Quitar todo" }));
    expect(useCommunityStore.getState().query).toBe("");
  });

  it("no filters → no chips (and the shelves view)", async () => {
    mount(createElement(Feed), { "/api/community/trending": { hot: [sticker("h")], shelves: [] } });
    await screen.findByText("T-h");
    expect(screen.queryByRole("button", { name: /Quitar filtro/ })).toBeNull();
  });
});

describe("Top de la semana", () => {
  it("a ranked list: position, title, creator, numbers in words, send — medals for 1–3", async () => {
    mount(createElement(Ranking), {
      "/api/community/stickers": {
        items: [
          sticker("a", { downloads: 12, saves: 3 }),
          sticker("b", { downloads: 1, saves: 0 }),
          sticker("c"),
          sticker("d"),
        ],
        nextCursor: null,
      },
    });
    expect(await screen.findByText("T-a")).toBeTruthy();
    expect(screen.getByLabelText("Puesto 1")).toBeTruthy();
    expect(screen.getByText("12 descargas · 3 favoritos")).toBeTruthy();
    expect(screen.getByText("1 descarga")).toBeTruthy();
    expect(screen.getAllByText("Nuevo")).toHaveLength(2);
    expect(screen.getAllByText("@ana")).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: /Escuchar «T-/ })).toHaveLength(4);
  });
});
