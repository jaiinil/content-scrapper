import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { ImageRef, NormalizedSection, SiteAdapter } from "../types.js";
import { bodyHtmlFromParagraphs, collectImages, collectLinks, createOrderCounter, extractMeta, headingsText } from "./shared.js";

function extractHero($: CheerioAPI, pageUrl: string, nextOrder: () => number, seenImages: Set<string>): NormalizedSection | undefined {
  const hero = $("#hero").first();
  if (hero.length === 0) return undefined;

  const headings = headingsText($, hero);
  const images = collectImages($, hero, pageUrl, seenImages);
  if (headings.length === 0 && images.length === 0) return undefined;

  return {
    sectionType: "hero",
    order: nextOrder(),
    heading: headings[0],
    subheading: headings[1],
    images,
  };
}

function extractContentBlocks(
  $: CheerioAPI,
  pageUrl: string,
  nextOrder: () => number,
  seenImages: Set<string>,
): NormalizedSection[] {
  const sections: NormalizedSection[] = [];
  $("article#content")
    .first()
    .children('div[class*="column_"]')
    .each((_, el) => {
      const block = $(el);
      const headings = headingsText($, block);
      const bodyHtml = bodyHtmlFromParagraphs($, block);
      const images = collectImages($, block, pageUrl, seenImages);
      if (!headings.length && !bodyHtml && !images.length) return;

      sections.push({
        sectionType: "content-block",
        order: nextOrder(),
        heading: headings[0],
        subheading: headings[1],
        bodyHtml,
        images,
        links: collectLinks($, block),
      });
    });
  return sections;
}

function extractTouts($: CheerioAPI, pageUrl: string, nextOrder: () => number, seenImages: Set<string>): NormalizedSection[] {
  return $(".full_width_tout")
    .map((_, el) => {
      const block = $(el);
      const headings = headingsText($, block);
      const bodyHtml = bodyHtmlFromParagraphs($, block);
      const images = collectImages($, block, pageUrl, seenImages);
      const section: NormalizedSection = {
        sectionType: "tout",
        order: nextOrder(),
        heading: headings[0],
        bodyHtml,
        images,
        links: collectLinks($, block),
      };
      return section;
    })
    .get();
}

function extractQuotes($: CheerioAPI, nextOrder: () => number): NormalizedSection[] {
  return $(".columns.quotes .column_4, .quotes .column_4")
    .map((_, el) => {
      const block = $(el);
      const quote = block.find(".quote").text().trim();
      const source = block.find(".source").text().trim();
      if (!quote) return undefined;
      const section: NormalizedSection = {
        sectionType: "testimonial",
        order: nextOrder(),
        heading: quote,
        subheading: source || undefined,
        images: [],
        links: collectLinks($, block),
      };
      return section;
    })
    .get()
    .filter((s): s is NormalizedSection => s !== undefined);
}

function extractContactInfo($: CheerioAPI, nextOrder: () => number): NormalizedSection | undefined {
  const info = $("#hotel-information").first();
  if (info.length === 0) return undefined;

  const address = info
    .find(".address span")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .join(" ");

  const phoneLinks = collectLinks($, info).filter((l) => l.href.startsWith("tel:"));

  if (!address && phoneLinks.length === 0) return undefined;

  return {
    sectionType: "contact-info",
    order: nextOrder(),
    heading: address || undefined,
    images: [],
    links: phoneLinks,
  };
}

/** Anything with an alt-bearing image we haven't already captured — catches the map image, nearby-attractions imagery, blog teasers, etc. */
function extractLeftoverMedia(
  $: CheerioAPI,
  pageUrl: string,
  nextOrder: () => number,
  alreadyCaptured: Set<string>,
): NormalizedSection | undefined {
  const leftover: ImageRef[] = collectImages($, $("body"), pageUrl, alreadyCaptured);
  if (leftover.length === 0) return undefined;
  return {
    sectionType: "media",
    order: nextOrder(),
    images: leftover,
  };
}

export const kimptonAdapter: SiteAdapter = {
  id: "kimpton-template-v1",
  canHandle(html: string): boolean {
    // ihg.com/kimptonhotels.com booking links + the #hero/#content shell are present on every page of
    // this template; .full_width_tout is NOT (it's an optional per-page component), so don't require it.
    return /ihg\.com|kimptonhotels\.com/i.test(html) && /id=['"]hero['"]/.test(html) && /id=['"]content['"]/.test(html);
  },
  extract(html: string, pageUrl: string) {
    const $ = cheerio.load(html);
    const nextOrder = createOrderCounter();
    const meta = extractMeta($);
    const seenImages = new Set<string>();

    const sections: NormalizedSection[] = [];
    const hero = extractHero($, pageUrl, nextOrder, seenImages);
    if (hero) sections.push(hero);
    sections.push(...extractContentBlocks($, pageUrl, nextOrder, seenImages));
    sections.push(...extractTouts($, pageUrl, nextOrder, seenImages));
    sections.push(...extractQuotes($, nextOrder));
    const contactInfo = extractContactInfo($, nextOrder);
    if (contactInfo) sections.push(contactInfo);

    const leftoverMedia = extractLeftoverMedia($, pageUrl, nextOrder, seenImages);
    if (leftoverMedia) sections.push(leftoverMedia);

    return { meta, sections };
  },
};
