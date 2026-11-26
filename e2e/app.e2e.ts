import type { Browser } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clickButtonWithText, horizontalOverflow, launch, openPage } from "./browser.js";

let browser: Browser;
const url = inject("webUrl");

beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

describe("Estampido web (real browser, real API)", () => {
  it("first visit: the welcome tour walks through both paths and privacy, then stays closed", async () => {
    const { page, problems } = await openPage(browser, url, { width: 390, height: 844, tour: true });
    await page.waitForSelector('[role="dialog"]');
    // Steps slide in (exit animation first): wait for the text instead of reading right away.
    const dialogHas = (text: string) =>
      page.waitForFunction(
        (t) => (document.querySelector('[role="dialog"]') as HTMLElement | null)?.innerText.includes(t),
        { timeout: 5000 },
        text,
      );
    await dialogHas("Bienvenido a Estampido");
    await clickButtonWithText(page, "Siguiente", '[role="dialog"] button');
    await dialogHas("Crearlo tú en WhatsApp");
    await dialogHas("Enviar a mi WhatsApp");
    for (const next of ["Guárdalo y compártelo", "Cómo está hoy", "Tus stickers son tuyos"]) {
      await clickButtonWithText(page, "Siguiente", '[role="dialog"] button');
      await dialogHas(next);
    }
    await dialogHas("los borra a los 30 minutos");
    await clickButtonWithText(page, "Empezar", '[role="dialog"] button');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await page.reload({ waitUntil: "networkidle0" });
    expect(await page.$('[role="dialog"]')).toBeNull();
    // Header on desktop, footer on phones: click whichever is visible.
    await page.evaluate(() => {
      const visible = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="¿Cómo funciona?"]')].find(
        (b) => b.offsetParent !== null,
      );
      visible?.click();
    });
    await page.waitForSelector('[role="dialog"]');
    expect(problems).toEqual([]);
    await page.close();
  });

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

  it("collection: each conversion is added and preselected; survives reload", async () => {
    const { page, problems } = await openPage(browser, url);
    const input = await page.$('input[type=file][accept="video/*,image/*"]');
    await input?.uploadFile(inject("clip"));
    await page.waitForSelector("video");
    for (const n of [1, 2]) {
      await clickButtonWithText(page, "Crear sticker");
      await page.waitForFunction(
        (k) => document.body.innerText.includes(`${k} de ${k} seleccionados`),
        { timeout: 90_000 },
        n,
      );
    }
    expect(await page.$$eval('button[aria-pressed="true"][aria-label^="Sticker"]', (els) => els.length)).toBe(2);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("2 de 2 seleccionados"));
    expect(problems).toEqual([]);
    await page.close();
  });

  it("navigation: Crear ⇄ Comunidad, community sections, 404", async () => {
    const { page, problems } = await openPage(browser, url);
    await page.click('nav a[href="/comunidad"]');
    await page.waitForFunction(() => document.body.innerText.includes("Lo que suena en el chat."));
    expect(await page.evaluate(() => location.pathname)).toBe("/comunidad");
    const titles = await page.$$eval("section h2", (hs) => hs.map((h) => h.textContent ?? ""));
    for (const t of [
      "Tendencias",
      "Top de la semana",
      "Sonidos virales",
      "Reto semanal",
      "Packs de la comunidad",
      "Tu espacio",
      "Creadores",
    ]) {
      expect(titles.some((x) => x.includes(t))).toBe(true);
    }
    expect(await page.$eval('nav a[href="/comunidad"]', (a) => a.getAttribute("aria-current"))).toBe("page");
    await page.click('nav a[href="/"]');
    await page.waitForSelector('input[type=file][accept="video/*,image/*"]');
    await page.goto(new URL("/no-existe", url).href, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("Página no encontrada"));
    expect(problems).toEqual([]);
    await page.close();
  });

  it("voice recording becomes the sticker's sound", async () => {
    const { page, problems } = await openPage(browser, url);
    // Headless can't get OS mic permission: feed a real WebAudio tone as the mic.
    await page.evaluateOnNewDocument(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const dest = ctx.createMediaStreamDestination();
        osc.connect(dest);
        osc.start();
        return dest.stream;
      };
    });
    await page.reload({ waitUntil: "networkidle0" });
    const input = await page.$('input[type=file][accept="video/*,image/*"]');
    await input?.uploadFile(inject("clip"));
    await page.waitForSelector("video");
    await clickButtonWithText(page, "Sonido", "[role=tab]");
    await clickButtonWithText(page, "Grabar");
    await page.waitForFunction(() => document.body.innerText.includes("Listo"));
    await new Promise((r) => setTimeout(r, 1500));
    await clickButtonWithText(page, "Listo");
    await page.waitForFunction(() => /Grabación 0-0\d\.\w+/.test(document.body.innerText));
    await clickButtonWithText(page, "Crear sticker");
    await page.waitForFunction(() => document.body.innerText.includes("Disponible hasta"), { timeout: 90_000 });
    const sound = await page.evaluate(
      () =>
        [...document.querySelectorAll("dl dt")].find((d) => d.textContent === "Sonido")?.nextElementSibling
          ?.textContent,
    );
    expect(sound).toMatch(/^0:0[1-2]/);
    expect(problems).toEqual([]);
    await page.close();
  });

  it("a very long file name never widens the layout (phone width)", async () => {
    const { copyFile, mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "sva-long-"));
    const long = join(dir, `${"mi_video_super_largo_de_la_fiesta_".repeat(6)}final.mp4`);
    await copyFile(inject("clip"), long);
    const { page, problems } = await openPage(browser, url);
    await page.setViewport({ width: 390, height: 844 });
    const input = await page.$('input[type=file][accept="video/*,image/*"]');
    await input?.uploadFile(long);
    await page.waitForSelector("video");
    const widths = await page.evaluate(() =>
      [...document.querySelectorAll("main section")].map((s) => Math.round(s.getBoundingClientRect().width)),
    );
    expect(Math.max(...widths)).toBeLessThanOrEqual(390);
    expect(await horizontalOverflow(page)).toBe(0);
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
