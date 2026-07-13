import * as cheerio from "cheerio";
import type { SiteConfig } from "../types.js";

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch sitemap ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/** Handles both a plain <urlset> and a <sitemapindex> that points at sub-sitemaps. */
async function collectUrls(sitemapUrl: string, seen = new Set<string>()): Promise<string[]> {
  if (seen.has(sitemapUrl)) return [];
  seen.add(sitemapUrl);

  const xml = await fetchXml(sitemapUrl);
  const $ = cheerio.load(xml, { xmlMode: true });

  const subSitemaps = $("sitemapindex > sitemap > loc")
    .map((_, el) => $(el).text().trim())
    .get();

  if (subSitemaps.length > 0) {
    const nested = await Promise.all(subSitemaps.map((loc) => collectUrls(loc, seen)));
    return nested.flat();
  }

  return $("urlset > url > loc")
    .map((_, el) => $(el).text().trim())
    .get();
}

export function isExcluded(url: string, excludePatterns: string[] | undefined): boolean {
  if (!excludePatterns || excludePatterns.length === 0) return false;
  const path = new URL(url).pathname;
  return excludePatterns.some((pattern) => new RegExp(pattern).test(path));
}

export async function discoverUrls(config: SiteConfig): Promise<string[]> {
  if (config.discovery.type !== "sitemap") {
    throw new Error(`Unsupported discovery type: ${config.discovery.type}`);
  }
  const sitemapUrl = new URL(config.discovery.path, config.baseUrl).toString();
  const urls = await collectUrls(sitemapUrl);
  const sameOrigin = urls.filter((u) => {
    try {
      return new URL(u).origin === new URL(config.baseUrl).origin;
    } catch {
      return false;
    }
  });
  const deduped = Array.from(new Set(sameOrigin));
  return deduped.filter((u) => !isExcluded(u, config.excludePatterns));
}
