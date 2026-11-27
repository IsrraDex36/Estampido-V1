import type { Browser, Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clickButtonWithText, gotoSettled, launch, openPage } from "./browser.js";

let browser: Browser;
const url = inject("webUrl");
const community = new URL("/comunidad", url).href;

beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

async function bodyHas(page: Page, text: string, timeout = 30_000): Promise<void> {
  try {
    await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
  } catch {
    const seen = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 600));
    throw new Error(`Never saw «${text}» on ${page.url()}. Page text: ${seen}`);
  }
}

/** Upload the e2e clip and convert it; returns the result id (from the session collection). */
async function makeSticker(page: Page): Promise<string> {
  const input = await page.$('input[type=file][accept="video/*,image/*"]');
  await input?.uploadFile(inject("clip"));
  await page.waitForSelector("video");
  await clickButtonWithText(page, "Crear sticker");
  await bodyHas(page, "Disponible hasta", 90_000);
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("estampido-collection");
    return (JSON.parse(raw ?? "{}") as { state: { items: { id: string }[] } }).state.items[0]?.id ?? "";
  });
}

describe("Community (real browser, real API)", () => {
  it("publish → appears in the feed → save → my space → «Usar» its sound in Crear", async () => {
    const { page, problems } = await openPage(browser, url);
    await makeSticker(page);

    // Publish: category is required; then title/tags and publish (no rights checkbox).
    await clickButtonWithText(page, "Publicar");
    await bodyHas(page, "Publicar en la comunidad");
    const submit = async () => {
      const buttons = await page.$$('[role="dialog"] button[type="submit"]');
      return buttons[0];
    };
    expect(await (await submit())?.evaluate((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    await clickButtonWithText(page, "Memes", '[role="dialog"] button');
    await page.type('[role="dialog"] input:not([type])', "Prueba e2e");
    expect(await page.$('[role="dialog"] input[type="checkbox"]')).toBeNull();
    await (await submit())?.click();
    await bodyHas(page, "Publicado");

    // Feed shows it; save it.
    await gotoSettled(page, community);
    await bodyHas(page, "Prueba e2e");
    // Labeled toggle (★ «Favorito», like WhatsApp): visible text = name, state in aria-pressed.
    await clickButtonWithText(page, "Favorito", "article button[aria-pressed]");
    await page.waitForFunction(() =>
      [...document.querySelectorAll("article button[aria-pressed]")].some(
        (b) => b.textContent?.trim() === "Favorito" && b.getAttribute("aria-pressed") === "true",
      ),
    );
    // «Tu espacio» tab: the saved one is counted there.
    await clickButtonWithText(page, "Tu espacio", 'nav[aria-label="Secciones de la comunidad"] [role="tab"]');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[role="tab"]')].some((t) => t.textContent === "Favoritos1"),
    ); // tab with count
    await clickButtonWithText(page, "Stickers", 'nav[aria-label="Secciones de la comunidad"] [role="tab"]');
    await page.waitForSelector('article a[aria-label="Usar este sonido en mi clip"]');

    // Use its sound → Crear with the sound loaded.
    await page.click('article a[aria-label="Usar este sonido en mi clip"]');
    await bodyHas(page, "Sonido «Prueba e2e» listo");
    expect(await page.evaluate(() => location.pathname + location.search)).toBe("/");
    await bodyHas(page, "Sonido: «Prueba e2e»"); // badge on the Clip section
    const input = await page.$('input[type=file][accept="video/*,image/*"]');
    await input?.uploadFile(inject("clip"));
    await page.waitForSelector("video");
    await clickButtonWithText(page, "Sonido", "[role=tab]");
    await bodyHas(page, "De la comunidad · «Prueba e2e»");

    // Its use was counted.
    const stats = await page.evaluate(async () => (await fetch("/api/community/stats")).json());
    expect(stats).toMatchObject({ uses: 1 });
    expect(problems).toEqual([]);
    await page.close();
  });

  it("pagination: 30+ stickers load across pages (scroll), no duplicates, ends", async () => {
    const { page, problems } = await openPage(browser, url);
    const resultId = await makeSticker(page);
    // Seed through the real API (same result published many times).
    await page.evaluate(async (id) => {
      for (let i = 1; i <= 30; i++) {
        const res = await fetch("/api/community/stickers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resultId: id, category: "anime", title: `Pagina ${i}`, ownsAudio: true }),
        });
        if (!res.ok) throw new Error(`seed ${res.status}`);
      }
    }, resultId);

    await gotoSettled(page, `${community}?orden=new&cat=anime`);
    await page.waitForSelector("article");
    // Only the feed (Tu espacio also renders saved cards).
    const count = () =>
      page.$$eval('section[aria-labelledby="sec-01"] article h3', (hs) => hs.map((h) => h.textContent ?? ""));
    expect((await count()).length).toBe(24); // first page

    // Scroll to the end: the sentinel loads the next page.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(
      () => document.querySelectorAll('section[aria-labelledby="sec-01"] article h3').length >= 30,
      { timeout: 15_000 },
    );
    await bodyHas(page, "no hay más");
    const titles = (await count()).filter((t) => t.startsWith("Pagina "));
    expect(titles).toHaveLength(30);
    expect(new Set(titles).size).toBe(30);
    expect(titles[0]).toBe("Pagina 30"); // newest first
    expect(problems).toEqual([]);
    await page.close();
  });
});
