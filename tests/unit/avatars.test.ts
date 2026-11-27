import { rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { AVATAR_COLORS, AVATAR_EMOJI_GROUPS, AVATAR_EMOJIS } from "../../src/adapters/http/contract.js";
import { makeHarness } from "../helpers/apiHarness.js";
import { makeTempDir } from "../helpers/fixtures.js";

const ORIGINAL = ["🐸", "🐱", "🐶", "🦊", "🐼", "🐵", "🦄", "🐙", "👾", "🤖", "👻", "🎧", "🔥", "⭐", "🍕", "🌮"];
const ORIGINAL_COLORS = ["lime", "pink", "sky", "amber", "violet", "coral"];

describe("avatar choices", () => {
  it("every avatar people already have stays valid (only additions)", () => {
    for (const e of ORIGINAL) expect(AVATAR_EMOJIS).toContain(e);
    for (const c of ORIGINAL_COLORS) expect(AVATAR_COLORS).toContain(c);
  });

  it("many more to pick from, no duplicates, groups = the full list", () => {
    expect(AVATAR_EMOJIS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(AVATAR_EMOJIS).size).toBe(AVATAR_EMOJIS.length);
    expect(AVATAR_EMOJI_GROUPS.flatMap((g) => [...g.emojis])).toEqual([...AVATAR_EMOJIS]);
    expect(AVATAR_COLORS.length).toBeGreaterThanOrEqual(10);
  });

  it("each emoji is one symbol (no spaces — the avatar is «emoji color» — and no ZWJ sequences)", () => {
    for (const e of AVATAR_EMOJIS) {
      expect(e).not.toMatch(/\s|\u200d/);
      expect([...new Intl.Segmenter("es", { granularity: "grapheme" }).segment(e)]).toHaveLength(1);
    }
  });

  it("the server accepts the new emojis and colors, and still refuses made-up ones", async () => {
    const dir = await makeTempDir();
    const h = await makeHarness(dir);
    await h.signIn("ana", "ana");
    const set = (avatar: string) => h.req("ana", "/api/me", { method: "PATCH", body: JSON.stringify({ avatar }) });
    expect((await set("🫠 mint")).status).toBe(200);
    expect((await set("🧋 slate")).status).toBe(200);
    expect((await set("🦊 lime")).status).toBe(200); // an original still works
    expect((await set("🍆 lime")).status).toBe(400);
    expect((await set("🦊 rainbow")).status).toBe(400);
    h.close();
    await rm(dir, { recursive: true, force: true });
  });
});
