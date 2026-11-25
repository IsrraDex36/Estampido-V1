import { describe, expect, it } from "vitest";
import { canonicalPath, canonicalSearch, canonicalUrl } from "../../web/src/app/url.js";

const ID = "3dde6acd-cd11-455d-bdcb-c84e3639facf";

describe("canonicalPath", () => {
  it.each([
    ["/", "/"],
    ["", "/"],
    ["/Comunidad", "/comunidad"],
    ["/comunidad/", "/comunidad"],
    ["//comunidad///", "/comunidad"],
    ["/COMMUNITY", "/comunidad"],
    ["/crear/", "/"],
    ["/index.html", "/"],
    ["/nada/que/ver", "/nada/que/ver"], // unknown → stays → 404
    ["/%E0%A4%A", "/%e0%a4%a"], // malformed encoding never throws
  ])("%s → %s", (input, out) => expect(canonicalPath(input)).toBe(out));

  it("caps absurdly long paths", () => {
    expect(canonicalPath(`/${"a".repeat(10_000)}`).length).toBeLessThanOrEqual(2048);
  });
});

describe("canonicalSearch", () => {
  it("community keeps only valid filters, in canonical order", () => {
    expect(canonicalSearch("/comunidad", "?cat=memes&foo=1&orden=top&utm_source=x").search).toBe(
      "?orden=top&cat=memes",
    );
    expect(canonicalSearch("/comunidad", "?orden=<script>&cat=../../etc&periodo=nope").search).toBe("");
    expect(canonicalSearch("/comunidad", "?q=%E0%A4%A&q=dos").search).toMatch(/^\?q=/); // malformed % never throws
    expect(canonicalSearch("/comunidad", `?q=${"x".repeat(500)}`).search.length).toBeLessThan(100);
  });

  it("create keeps only a valid ?sonido= (uuid), flags invalid ones", () => {
    expect(canonicalSearch("/", `?sonido=${ID.toUpperCase()}&x=1`)).toEqual({
      search: `?sonido=${ID}`,
      invalidSound: false,
    });
    expect(canonicalSearch("/", "?sonido=../../etc/passwd")).toEqual({ search: "", invalidSound: true });
    expect(canonicalSearch("/", "?sonido=")).toEqual({ search: "", invalidSound: true });
    expect(canonicalSearch("/", "?foo=bar")).toEqual({ search: "", invalidSound: false });
  });

  it("unknown routes drop every param", () => {
    expect(canonicalSearch("/nada", "?a=1").search).toBe("");
  });
});

describe("canonicalUrl", () => {
  it("reports when the URL must be replaced", () => {
    expect(canonicalUrl("/comunidad", "?orden=top")).toMatchObject({ href: "/comunidad?orden=top", changed: false });
    expect(canonicalUrl("/Comunidad/", "orden=top&junk=1")).toMatchObject({
      href: "/comunidad?orden=top",
      changed: true,
    });
    expect(canonicalUrl("/", "")).toMatchObject({ href: "/", changed: false });
  });
});

describe("canonicalUrl is idempotent (no redirect loops)", () => {
  it.each([
    ["/Comunidad/", "?orden=top&junk=1"],
    ["//community//", "?q=%E0%A4%A"],
    ["/", "?sonido=../../x"],
    ["/", `?sonido=${ID.toUpperCase()}`],
    ["/comunidad", "?q=%25%25%25&cat=memes&cat=anime"],
    ["/comunidad", "?periodo=day&orden=top"],
    ["/nada", "?a=1"],
    ["/", "?q=😀&orden=new"],
  ])("%s%s", (path, search) => {
    const once = canonicalUrl(path, search);
    const twice = canonicalUrl(once.path, once.search);
    expect(twice.changed).toBe(false);
    expect(twice.href).toBe(once.href);
  });
});
