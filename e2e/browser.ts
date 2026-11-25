import { existsSync } from "node:fs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

/** Local Chromium-family browser: CHROME_PATH, else common macOS/Linux paths. */
export function chromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean) as string[];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("No Chrome/Chromium found. Set CHROME_PATH.");
  return found;
}

export async function launch(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--no-first-run", "--disable-extensions"],
  });
}

export interface OpenedPage {
  page: Page;
  /** Console errors/warnings and uncaught exceptions seen so far. */
  problems: string[];
}

export async function openPage(
  browser: Browser,
  url: string,
  { width = 1440, height = 900, scheme = "light" as "light" | "dark" } = {},
): Promise<OpenedPage> {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${(e as Error).message}`));
  page.on("console", (m) => {
    // Ignore the expected 404/503 noise-free path; report real errors/warnings.
    if (m.type() === "error" || m.type() === "warn") problems.push(`${m.type()}: ${m.text()}`);
  });
  await page.setViewport({ width, height });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await page.goto(url, { waitUntil: "networkidle0" });
  return { page, problems };
}

export const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

export async function clickButtonWithText(page: Page, text: string): Promise<void> {
  for (const b of await page.$$("button")) {
    if ((await b.evaluate((e) => e.textContent ?? "")).includes(text)) {
      await b.click();
      return;
    }
  }
  throw new Error(`button "${text}" not found`);
}
