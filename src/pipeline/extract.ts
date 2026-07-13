import { mkdir, writeFile } from "node:fs/promises";
import pLimit from "p-limit";
import { detectAdapter, getAdapter } from "../adapters/registry.js";
import { closeBrowser, renderPage } from "../fetch/browser.js";
import { loadCrawledUrls } from "./crawl.js";
import { pageFileName, pagesDir, siteDataDir } from "../storage/paths.js";
import path from "node:path";
import type { ScrapedPage, SiteConfig } from "../types.js";

export interface ExtractResult {
  siteId: string;
  total: number;
  succeeded: number;
  failed: { url: string; error: string }[];
}

export interface ExtractOptions {
  concurrency?: number;
  limit?: number;
  /** Extract only these specific URLs instead of everything in urls.json (useful for targeted re-checks). */
  onlyUrls?: string[];
  /** Called after each page finishes (success or failure) — lets callers (e.g. a job tracker) report live progress. */
  onProgress?: (completed: number, total: number) => void;
  /** The server keeps a shared browser alive across requests/jobs — pass true to skip the CLI's close-on-finish behavior. */
  keepBrowserOpen?: boolean;
}

export async function extractSite(config: SiteConfig, options: ExtractOptions = {}): Promise<ExtractResult> {
  const { concurrency = 3, limit, onlyUrls, onProgress, keepBrowserOpen = false } = options;
  // No config.adapter -> auto-detect per page instead of forcing one adapter for the whole site.
  const fixedAdapter = config.adapter ? getAdapter(config.adapter) : undefined;
  const allUrls = onlyUrls ?? (await loadCrawledUrls(config.siteId));
  const urls = limit ? allUrls.slice(0, limit) : allUrls;

  await mkdir(pagesDir(config.siteId), { recursive: true });

  const run = pLimit(concurrency);
  const failed: { url: string; error: string }[] = [];
  let succeeded = 0;
  let completed = 0;

  try {
    await Promise.all(
      urls.map((url) =>
        run(async () => {
          try {
            const html = await renderPage(url);
            const adapter = fixedAdapter ?? detectAdapter(html, url);
            const { meta, sections } = adapter.extract(html, url);
            const page: ScrapedPage = {
              siteId: config.siteId,
              url,
              meta,
              sections,
              scrapedAt: new Date().toISOString(),
              adapterUsed: adapter.id,
            };
            await writeFile(path.join(pagesDir(config.siteId), pageFileName(url)), JSON.stringify(page, null, 2), "utf-8");
            succeeded += 1;
          } catch (err) {
            failed.push({ url, error: err instanceof Error ? err.message : String(err) });
          } finally {
            completed += 1;
            onProgress?.(completed, urls.length);
          }
        }),
      ),
    );
  } finally {
    if (!keepBrowserOpen) await closeBrowser();
  }

  const result: ExtractResult = { siteId: config.siteId, total: urls.length, succeeded, failed };
  await writeFile(path.join(siteDataDir(config.siteId), "extract-summary.json"), JSON.stringify(result, null, 2), "utf-8");
  return result;
}
