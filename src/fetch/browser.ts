import { type Browser, chromium } from "playwright";

let browserPromise: Promise<Browser> | undefined;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

export interface RenderOptions {
  /** ms to wait after DOM content loads, to let AJAX-populated sections (amenities list, etc.) fire and resolve. */
  settleMs?: number;
  timeoutMs?: number;
}

/**
 * Renders a page with a real browser and returns the final HTML.
 * Several sections on these hotel templates (amenities list, nearby
 * attractions, blog teasers, alert banners) are populated client-side
 * via AJAX after load, so a plain HTTP fetch misses them.
 *
 * Deliberately does NOT wait for "networkidle" — these pages embed live-chat
 * and analytics widgets that hold connections open indefinitely, so networkidle
 * never fires and every page times out. A fixed settle delay after
 * domcontentloaded is more reliable here.
 */
export async function renderPage(url: string, options: RenderOptions = {}): Promise<string> {
  const { settleMs = 3000, timeoutMs = 30000 } = options;
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(settleMs);
    return await page.content();
  } finally {
    await context.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = undefined;
  }
}
