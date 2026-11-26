import { describe, expect, it } from "vitest";
import { COMMUNITY_TAG_RE } from "../../src/adapters/http/contract.js";
import {
  defaultShare,
  needsAudioRights,
  parseTags,
  publishFormSchema,
  shareOptions,
  splitTags,
} from "../../web/src/features/converter/model/publish.js";

const own = { hasAudio: true, fromCommunity: false };
const remix = { hasAudio: true, fromCommunity: true };
const silent = { hasAudio: false, fromCommunity: false };
const base = { share: "both" as const, category: "memes", title: "", tags: "", owns: true };
const errorsOf = (r: ReturnType<ReturnType<typeof publishFormSchema>["safeParse"]>) =>
  r.success ? [] : r.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`);

describe("«Publicar»: what to share", () => {
  it("offers only what makes sense, with the reason", () => {
    expect(shareOptions(own)).toEqual({ both: null, sticker: null, sound: null });
    expect(shareOptions(silent).both).toMatch(/no tiene sonido/);
    expect(shareOptions(silent).sound).toMatch(/no tiene sonido/);
    expect(shareOptions(remix).sound).toMatch(/ya está en la comunidad/);
    expect(defaultShare(own)).toBe("both");
    expect(defaultShare(silent)).toBe("sticker");
  });

  it("asks for audio rights only when sharing your own sound", () => {
    expect(needsAudioRights("both", own)).toBe(true);
    expect(needsAudioRights("sound", own)).toBe(true);
    expect(needsAudioRights("sticker", own)).toBe(false); // silent copy
    expect(needsAudioRights("both", remix)).toBe(false); // community sound
    expect(errorsOf(publishFormSchema(own).safeParse({ ...base, owns: false }))).toEqual([
      "owns: Confirma que el audio es tuyo o que tienes permiso.",
    ]);
    expect(publishFormSchema(own).safeParse({ ...base, share: "sticker", owns: false }).success).toBe(true);
  });

  it("blocks impossible combinations", () => {
    expect(errorsOf(publishFormSchema(silent).safeParse({ ...base, share: "sound" }))[0]).toMatch(/^share:/);
    expect(errorsOf(publishFormSchema(remix).safeParse({ ...base, share: "sound" }))[0]).toMatch(/ya está/);
    expect(publishFormSchema(silent).safeParse({ ...base, share: "sticker", owns: false }).success).toBe(true);
  });
});

describe("«Publicar» form fields (same rules as the API)", () => {
  it("requires a category", () => {
    expect(errorsOf(publishFormSchema(own).safeParse({ ...base, category: undefined }))).toEqual([
      "category: Elige una categoría.",
    ]);
  });

  it("caps the title at 60 characters (after trimming)", () => {
    expect(publishFormSchema(own).safeParse({ ...base, title: `  ${"a".repeat(60)}  ` }).success).toBe(true);
    expect(errorsOf(publishFormSchema(own).safeParse({ ...base, title: "a".repeat(61) }))[0]).toMatch(/^title:/);
  });

  it("validates tags: count, length and characters", () => {
    const tags = (t: string) => errorsOf(publishFormSchema(own).safeParse({ ...base, tags: t }));
    expect(tags("risa, gato #perro")).toEqual([]);
    expect(tags("uno dos tres cuatro")).toEqual(["tags: Máximo 3 etiquetas."]);
    expect(tags("a".repeat(21))[0]).toMatch(/muy larga/);
    expect(tags("hola!")[0]).toMatch(/solo letras, números/);
    expect(tags("café niño_1 año-2")).toEqual([]);
  });

  it("splitTags keeps everything (for validation); parseTags sends at most 3", () => {
    expect(splitTags("Risa, gato  #Risa perro loro")).toEqual(["risa", "gato", "perro", "loro"]);
    expect(parseTags("Risa, gato  #Risa perro loro")).toEqual(["risa", "gato", "perro"]);
  });

  it("the shared tag rule matches the API's", () => {
    expect(COMMUNITY_TAG_RE.test("gato_1-b")).toBe(true);
    expect(COMMUNITY_TAG_RE.test("gato!")).toBe(false);
  });
});
