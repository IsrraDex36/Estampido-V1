import { describe, expect, it } from "vitest";
import { COMMUNITY_TAG_RE } from "../../src/adapters/http/contract.js";
import { parseTags, publishFormSchema, splitTags } from "../../web/src/features/converter/model/publish.js";

const base = { category: "memes", title: "", tags: "", owns: false };
const errorsOf = (r: ReturnType<ReturnType<typeof publishFormSchema>["safeParse"]>) =>
  r.success ? [] : r.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`);

describe("«Publicar» form schema (same rules as the API)", () => {
  it("requires a category", () => {
    expect(errorsOf(publishFormSchema(false).safeParse({ ...base, category: undefined }))).toEqual([
      "category: Elige una categoría.",
    ]);
    expect(publishFormSchema(false).safeParse(base).success).toBe(true);
  });

  it("asks for audio rights only when the sticker has its own sound", () => {
    expect(errorsOf(publishFormSchema(true).safeParse(base))).toEqual([
      "owns: Confirma que el audio es tuyo o que tienes permiso.",
    ]);
    expect(publishFormSchema(true).safeParse({ ...base, owns: true }).success).toBe(true);
  });

  it("caps the title at 60 characters (after trimming)", () => {
    expect(publishFormSchema(false).safeParse({ ...base, title: `  ${"a".repeat(60)}  ` }).success).toBe(true);
    expect(errorsOf(publishFormSchema(false).safeParse({ ...base, title: "a".repeat(61) }))[0]).toMatch(/^title:/);
  });

  it("validates tags: count, length and characters", () => {
    const tags = (t: string) => errorsOf(publishFormSchema(false).safeParse({ ...base, tags: t }));
    expect(tags("risa, gato #perro")).toEqual([]);
    expect(tags("uno dos tres cuatro")).toEqual(["tags: Máximo 3 etiquetas."]);
    expect(tags("a".repeat(21))[0]).toMatch(/muy larga/);
    expect(tags("hola!")[0]).toMatch(/solo letras, números/);
    expect(tags("café niño_1 año-2")).toEqual([]); // any language
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
