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
  { width = 1440, height = 900, scheme = "light" as "light" | "dark", tour = false } = {},
): Promise<OpenedPage> {
  const page = await browser.newPage();
  // The welcome tour opens on a first visit; most tests start as a returning visitor.
  if (!tour) await page.evaluateOnNewDocument(() => localStorage.setItem("estampido-tour-v1", "1"));
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${(e as Error).message}`));
  page.on("console", (m) => {
    // Ignore the expected 404/503 noise-free path; report real errors/warnings.
    if (m.type() === "error" || m.type() === "warn") problems.push(`${m.type()}: ${m.text()}`);
  });
  await page.setViewport({ width, height });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await gotoSettled(page, url);
  return { page, problems };
}

export const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

export async function clickButtonWithText(page: Page, text: string, selector = "button"): Promise<void> {
  for (const b of await page.$$(selector)) {
    if ((await b.evaluate((e) => e.textContent ?? "")).includes(text)) {
      await b.click();
      return;
    }
  }
  throw new Error(`button "${text}" not found`);
}

/**
 * Navigate and wait until the app has settled. «networkidle0» alone (zero
 * connections for 500 ms) was flaky on slow CI runners: one slow request kept
 * the whole navigation from ever resolving. Now: wait for `load`, then for a
 * quiet network as best effort (bounded); if it never gets quiet, log which
 * requests were still open (diagnosis) and go on — tests then wait for the
 * specific content they need.
 */
export async function gotoSettled(page: Page, url: string, quietTimeoutMs = 15_000): Promise<void> {
  const open = new Map<unknown, string>();
  const onReq = (r: { url(): string }) => open.set(r, r.url());
  const onDone = (r: unknown) => open.delete(r);
  page.on("request", onReq);
  page.on("requestfinished", onDone);
  page.on("requestfailed", onDone);
  try {
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: quietTimeoutMs }).catch(() => {
      console.warn(
        `[e2e] la red no se calmó en ${quietTimeoutMs} ms (${url}); abiertas: ${[...open.values()].join(", ") || "ninguna"}`,
      );
    });
  } finally {
    page.off("request", onReq);
    page.off("requestfinished", onDone);
    page.off("requestfailed", onDone);
  }
}

/** Reload with the same settling rules as gotoSettled. */
export async function reloadSettled(page: Page): Promise<void> {
  await gotoSettled(page, page.url());
}
