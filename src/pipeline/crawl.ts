import { mkdir, writeFile } from "node:fs/promises";
import { discoverUrls } from "../discovery/sitemap.js";
import { siteDataDir, urlsFilePath } from "../storage/paths.js";
import type { SiteConfig } from "../types.js";

export async function crawlSite(config: SiteConfig): Promise<string[]> {
  const urls = await discoverUrls(config);
  await mkdir(siteDataDir(config.siteId), { recursive: true });
  await writeFile(
    urlsFilePath(config.siteId),
    JSON.stringify({ siteId: config.siteId, discoveredAt: new Date().toISOString(), count: urls.length, urls }, null, 2),
    "utf-8",
  );
  return urls;
}

export async function loadCrawledUrls(siteId: string): Promise<string[]> {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(urlsFilePath(siteId), "utf-8");
  const parsed = JSON.parse(raw) as { urls: string[] };
  return parsed.urls;
}
