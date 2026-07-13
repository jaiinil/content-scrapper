import type { AnyNode } from "domhandler";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { ImageRef, LinkRef, PageMeta } from "../types.js";

export function attr($: CheerioAPI, selector: string, name: string): string | undefined {
  const value = $(selector).attr(name);
  return value?.trim() || undefined;
}

export function metaContent($: CheerioAPI, selector: string): string | undefined {
  const value = $(selector).attr("content");
  return value?.trim() || undefined;
}

export function extractMeta($: CheerioAPI): PageMeta {
  const structuredData: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      structuredData.push(JSON.parse(raw));
    } catch {
      // malformed JSON-LD on the source page — skip rather than fail the whole page
    }
  });

  return {
    title: $("title").first().text().trim() || undefined,
    description: metaContent($, 'meta[name="description"]'),
    keywords: metaContent($, 'meta[name="keywords"]'),
    canonical: attr($, 'link[rel="canonical"]', "href"),
    ogTitle: metaContent($, 'meta[property="og:title"]'),
    ogDescription: metaContent($, 'meta[property="og:description"]'),
    ogImage: metaContent($, 'meta[property="og:image"]'),
    structuredData,
  };
}

/** Resolves relative src against pageUrl and dedupes (slideshow widgets commonly clone their first slide for looping). */
export function collectImages(
  $: CheerioAPI,
  scope: Cheerio<AnyNode>,
  pageUrl: string,
  seen: Set<string> = new Set(),
): ImageRef[] {
  const images: ImageRef[] = [];
  scope.find("img").each((_, el) => {
    const rawSrc = $(el).attr("src")?.trim();
    if (!rawSrc) return;
    const src = new URL(rawSrc, pageUrl).toString();
    if (seen.has(src)) return;
    seen.add(src);
    images.push({ src, alt: $(el).attr("alt")?.trim() ?? "" });
  });
  return images;
}

export function collectLinks($: CheerioAPI, scope: Cheerio<AnyNode>): LinkRef[] {
  const links: LinkRef[] = [];
  scope.find("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    const text = $(el).text().trim();
    if (!href || !text) return;
    links.push({ text, href });
  });
  return links;
}

export function headingsText($: CheerioAPI, scope: Cheerio<AnyNode>): string[] {
  return scope
    .find("h1, h2, h3, h4")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
}

export function bodyHtmlFromParagraphs($: CheerioAPI, scope: Cheerio<AnyNode>): string | undefined {
  const parts = scope
    .find("p, ul, ol")
    .map((_, el) => $.html(el))
    .get();
  const html = parts.join("\n").trim();
  return html.length > 0 ? html : undefined;
}

/** Fresh per page-extraction — do NOT hoist to module scope, since concurrent extract() calls would stomp on a shared counter. */
export function createOrderCounter(): () => number {
  let n = 0;
  return () => n++;
}
