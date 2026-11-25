import type { Browser, Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { launch, openPage } from "./browser.js";

let browser: Browser;
const url = inject("webUrl");
// Concatenate like the address bar would (new URL("//x", base) would treat "x" as a host).
const at = (path: string) => `${url.replace(/\/$/, "")}${path}`;

beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

const where = (page: Page) => page.evaluate(() => location.pathname + location.search);
const textHas = (page: Page, t: string) =>
  page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: 15_000 }, t);

describe("URLs are standardized and never break the app", () => {
  it.each([
    ["/Comunidad/", "/comunidad"],
    ["//comunidad///?orden=top&utm_source=x&cat=memes", "/comunidad?orden=top&cat=memes"],
    ["/community?orden=<script>alert(1)</script>&cat=../../etc&periodo=nope", "/comunidad"],
    ["/comunidad?q=%E0%A4%A", "/comunidad?q=%EF%BF%BD%25A"],
    ["/crear?foo=bar", "/"],
    ["/INDEX.HTML", "/"],
  ])("%s → %s", async (input, canonical) => {
    const { page, problems } = await openPage(browser, at(input));
    await page.waitForFunction((c) => location.pathname + location.search === c, { timeout: 15_000 }, canonical);
    expect(await where(page)).toBe(canonical);
    // The page rendered (no blank screen) and nothing leaked into the console.
    expect(await page.$("main h1, main h2")).not.toBeNull();
    expect(problems).toEqual([]);
    await page.close();
  });

  it("invalid ?sonido= link: one clear notice, URL cleaned, no API call", async () => {
    const { page, problems } = await openPage(browser, at("/?sonido=../../etc/passwd"));
    await textHas(page, "Ese enlace de sonido no es válido.");
    expect(await where(page)).toBe("/");
    const calls = await page.evaluate(
      () => performance.getEntriesByType("resource").filter((e) => e.name.includes("/api/community/sounds/")).length,
    );
    expect(calls).toBe(0);
    expect(problems).toEqual([]);
    await page.close();
  });

  it("unknown paths → 404 page with a way back; query dropped", async () => {
    const { page, problems } = await openPage(browser, at("/nada/que/ver?x=1"));
    await textHas(page, "Página no encontrada");
    expect(await where(page)).toBe("/nada/que/ver");
    expect(problems).toEqual([]);
    await page.close();
  });

  it("hovering «Comunidad» prefetches code + data before the click", async () => {
    const { page, problems } = await openPage(browser, url);
    const before = await page.evaluate(
      () => performance.getEntriesByType("resource").filter((e) => e.name.includes("/api/community/")).length,
    );
    expect(before).toBe(0);
    await page.hover('nav a[href="/comunidad"]');
    await page.waitForFunction(
      () => performance.getEntriesByType("resource").some((e) => e.name.includes("/api/community/stickers")),
      { timeout: 10_000 },
    );
    const names = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name));
    expect(names.some((n) => /CommunityPage-.*\.js/.test(n))).toBe(true); // lazy chunk already loaded
    expect(names.some((n) => n.includes("/api/community/stats"))).toBe(true);

    // The click renders from cache: no skeleton round-trip for the feed.
    await page.click('nav a[href="/comunidad"]');
    await textHas(page, "Lo que suena en el chat.");
    const feedCalls = await page.evaluate(
      () =>
        performance.getEntriesByType("resource").filter((e) => e.name.includes("/api/community/stickers?sort=hot"))
          .length,
    );
    expect(feedCalls).toBe(1);
    expect(problems).toEqual([]);
    await page.close();
  });
});
