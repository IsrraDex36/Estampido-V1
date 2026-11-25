import type { Browser } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clickButtonWithText, horizontalOverflow, launch, openPage } from "./browser.js";

declare module "vitest" {
  export interface ProvidedContext {
    webUrl: string;
    clip: string;
  }
}

let browser: Browser;
const url = inject("webUrl");

beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

describe("Estampido web (real browser, real API)", () => {
  it("loads cleanly with the mascot and no console problems", async () => {
    const { page, problems } = await openPage(browser, url);
    expect(await page.title()).toMatch(/Estampido/);
    expect(await page.$('[aria-label^="Pum"]')).not.toBeNull();
    expect(await page.evaluate(() => document.body.innerText)).toMatch(/Haz ruido en el chat/);
    expect(problems).toEqual([]);
    await page.close();
  });

  it.each([
    [390, 844],
    [1440, 900],
    [2560, 1440],
  ])("no horizontal scroll at %ix%i", async (width, height) => {
    const { page } = await openPage(browser, url, { width, height, scheme: "dark" });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.close();
  });

  it("full flow: upload → convert → result with sound and downloads", async () => {
    const { page, problems } = await openPage(browser, url);
    const input = await page.$('input[type=file][accept="video/*,image/*"]');
    await input?.uploadFile(inject("clip"));
    await page.waitForSelector("video");
    await clickButtonWithText(page, "Crear sticker");
    await page.waitForFunction(() => document.body.innerText.includes("Disponible hasta"), { timeout: 90_000 });
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).toMatch(/Tamaño/);
    expect(text).toMatch(/Sonido/);
    // the rendered sticker image actually loaded
    const loaded = await page.$eval('img[alt="Sticker generado"]', (img) => (img as HTMLImageElement).naturalWidth);
    expect(loaded).toBe(512);
    // bot is off in this isolated run → send disabled, download available
    expect(await page.$eval('button[aria-label="Descargar"]', (b) => (b as HTMLButtonElement).disabled)).toBe(false);
    expect(problems).toEqual([]);
    await page.close();
  });

  it("theme choice persists across reloads", async () => {
    const { page } = await openPage(browser, url, { scheme: "light" });
    await page.click('button[aria-label="Cambiar tema"]');
    await page.waitForSelector('[role="menuitemradio"]');
    for (const item of await page.$$('[role="menuitemradio"]')) {
      if ((await item.evaluate((e) => e.textContent ?? "")).includes("Oscuro")) await item.click();
    }
    await page.reload({ waitUntil: "networkidle0" });
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    await page.close();
  });

  it("tapping Pum makes it jump with a ¡PUM! bubble", async () => {
    const { page } = await openPage(browser, url);
    await page.click('button[aria-label^="Pum"]');
    await page.waitForFunction(() => document.body.innerText.includes("¡PUM!"), { timeout: 2000 });
    await page.close();
  });
});
