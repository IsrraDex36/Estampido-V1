import { describe, expect, it } from "vitest";
import type { CommunitySticker, Me } from "../../src/adapters/http/contract.js";
import { parseAvatar } from "../../web/src/features/account/avatarStyle.js";
import { profileDefaults, profilePatch, profileSchema } from "../../web/src/features/account/profileForm.js";
import { MAX_SAVED, useFavorites } from "../../web/src/features/community/store/favoritesStore.js";

const me: Me = {
  id: "u1",
  handle: "creador_1234",
  displayName: "Creador 1234",
  bio: "",
  avatar: "🐸 lime",
  phone: "…1111",
  createdAt: new Date(0).toISOString(),
  stats: { stickers: 0, uses: 0, saves: 0, sends: 0 },
};

describe("profile form (same rules as the API)", () => {
  it("defaults from the account; patch only sends what changed", () => {
    const d = profileDefaults(me);
    expect(d).toEqual({ handle: "creador_1234", displayName: "Creador 1234", bio: "", emoji: "🐸", color: "lime" });
    expect(profilePatch(me, profileSchema.parse(d))).toEqual({});
    const v = profileSchema.parse({ ...d, handle: " Ana_Memes ", emoji: "🦊", color: "pink", bio: " hola " });
    expect(profilePatch(me, v)).toEqual({ handle: "ana_memes", avatar: "🦊 pink", bio: "hola" });
  });

  it("rejects what the API rejects", () => {
    const d = profileDefaults(me);
    for (const bad of [{ handle: "ab" }, { handle: "con espacio" }, { displayName: "  " }, { bio: "x".repeat(161) }]) {
      expect(profileSchema.safeParse({ ...d, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("an unknown stored avatar falls back safely", () => {
    expect(profileDefaults({ ...me, avatar: "💩 black" })).toMatchObject({ emoji: "🐸", color: "lime" });
    expect(parseAvatar("")).toEqual({ emoji: "🐸", color: "lime" });
    expect(parseAvatar("🦊 sky")).toEqual({ emoji: "🦊", color: "sky" });
  });
});

describe("favorites mirror of the account", () => {
  const sticker = (id: string) => ({ id, title: id }) as unknown as CommunitySticker;
  it("replaceSaved mirrors the account (newest first, capped); clearAll empties the device on sign-out", () => {
    useFavorites.getState().clearAll();
    useFavorites.getState().toggleSticker(sticker("local"));
    const server = Array.from({ length: MAX_SAVED + 5 }, (_, i) => sticker(`s${i}`));
    useFavorites.getState().replaceSaved(server, []);
    const ids = Object.keys(useFavorites.getState().stickers);
    expect(ids).toHaveLength(MAX_SAVED);
    expect(ids[0]).toBe("s0");
    expect(ids).not.toContain("local");
    useFavorites.getState().addPublished(sticker("p"));
    useFavorites.getState().clearAll();
    expect(useFavorites.getState()).toMatchObject({ stickers: {}, sounds: {}, published: {} });
  });
});
