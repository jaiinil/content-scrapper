import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { ImageRef, NormalizedSection, SiteAdapter } from "../types.js";
import { collectImages, createOrderCounter, extractMeta } from "./shared.js";

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4"]);
const BODY_TAGS = new Set(["p", "ul", "ol"]);

interface PendingSection {
  heading?: string;
  subheading?: string;
  bodyParts: string[];
  images: ImageRef[];
}

/**
 * Segments arbitrary/unknown-template pages by walking headings + paragraphs + images
 * in document order (cheerio's .find() already returns descendants in doc order, so this
 * works across nesting depth rather than requiring siblings like nextUntil() would).
 * A new section starts at every third-or-later heading (heading -> subheading -> next section),
 * so a typical "h2 title, h3 tagline, body copy" block stays together.
 */
function extractSections($: CheerioAPI, pageUrl: string, nextOrder: () => number): NormalizedSection[] {
  const root = $("main").first().length > 0 ? $("main").first() : $("article").first().length > 0 ? $("article").first() : $("body");

  const sections: NormalizedSection[] = [];
  const seenImages = new Set<string>();
  let current: PendingSection | null = null;

  const flush = () => {
    if (!current) return;
    const bodyHtml = current.bodyParts.join("\n").trim() || undefined;
    if (current.heading || bodyHtml || current.images.length > 0) {
      sections.push({
        sectionType: "content-block",
        order: nextOrder(),
        heading: current.heading,
        subheading: current.subheading,
        bodyHtml,
        images: current.images,
      });
    }
    current = null;
  };

  root.find("h1, h2, h3, h4, p, ul, ol, img").each((_, el) => {
    const node = $(el);
    const tag = node.prop("tagName")?.toLowerCase();
    if (!tag) return;

    if (HEADING_TAGS.has(tag)) {
      const text = node.text().trim();
      if (!text) return;
      if (!current) {
        current = { heading: text, bodyParts: [], images: [] };
      } else if (!current.heading) {
        current.heading = text;
      } else if (!current.subheading) {
        current.subheading = text;
      } else {
        flush();
        current = { heading: text, bodyParts: [], images: [] };
      }
      return;
    }

    if (BODY_TAGS.has(tag)) {
      const text = node.text().trim();
      if (!text) return;
      if (!current) current = { bodyParts: [], images: [] };
      current.bodyParts.push($.html(el) ?? "");
      return;
    }

    if (tag === "img") {
      const rawSrc = node.attr("src")?.trim();
      if (!rawSrc) return;
      const src = new URL(rawSrc, pageUrl).toString();
      if (seenImages.has(src)) return;
      seenImages.add(src);
      if (!current) current = { bodyParts: [], images: [] };
      current.images.push({ src, alt: node.attr("alt")?.trim() ?? "" });
    }
  });
  flush();

  const leftoverImages = collectImages($, $("body"), pageUrl, seenImages);
  if (leftoverImages.length > 0) {
    sections.push({ sectionType: "media", order: nextOrder(), images: leftoverImages });
  }

  return sections;
}

export const genericAdapter: SiteAdapter = {
  id: "generic-v1",
  // Deliberately no canHandle — this is the last-resort fallback, never auto-preferred over a real adapter.
  extract(html: string, pageUrl: string) {
    const $ = cheerio.load(html);
    const nextOrder = createOrderCounter();
    const meta = extractMeta($);
    const sections = extractSections($, pageUrl, nextOrder);
    return { meta, sections };
  },
};
