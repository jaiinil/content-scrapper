import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");

export function siteDataDir(siteId: string): string {
  return path.join(DATA_DIR, siteId);
}

export function urlsFilePath(siteId: string): string {
  return path.join(siteDataDir(siteId), "urls.json");
}

export function pagesDir(siteId: string): string {
  return path.join(siteDataDir(siteId), "pages");
}

/** Deterministic, filesystem-safe filename for a scraped page, based on its URL path. */
export function pageFileName(url: string): string {
  const { pathname } = new URL(url);
  const slug = pathname.replace(/^\/|\/$/g, "").replace(/[^a-z0-9/-]/gi, "_") || "home";
  return `${slug.replace(/\//g, "__")}.json`;
}

const SITE_ID_PATTERN = /^[a-z0-9.-]+$/i;
const PAGE_FILE_PATTERN = /^[a-z0-9_.-]+\.json$/i;

/** Route params are attacker-controlled — reject anything that isn't a plain hostname / our own generated filename shape before it touches the filesystem. */
export function isValidSiteId(siteId: string): boolean {
  return SITE_ID_PATTERN.test(siteId) && !siteId.includes("..");
}

export function isValidPageFileName(fileName: string): boolean {
  return PAGE_FILE_PATTERN.test(fileName) && !fileName.includes("..");
}

/** Resolves a page file path and verifies it didn't escape pagesDir(siteId), even after the pattern checks above. */
export function resolvePageFilePath(siteId: string, fileName: string): string | undefined {
  const dir = pagesDir(siteId);
  const resolved = path.resolve(dir, fileName);
  if (!resolved.startsWith(dir + path.sep) && resolved !== dir) return undefined;
  return resolved;
}
