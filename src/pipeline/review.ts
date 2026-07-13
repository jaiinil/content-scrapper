import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pagesDir } from "../storage/paths.js";
import type { ScrapedPage } from "../types.js";

export interface ReviewSummary {
  siteId: string;
  pageCount: number;
  sectionsByType: Record<string, number>;
  totalImages: number;
  imagesMissingAlt: number;
  imagesWithSuspiciousAlt: number;
  pagesMissingDescription: string[];
  pagesWithNoSections: string[];
}

const SUSPICIOUS_ALT_VALUES = new Set(["null", "undefined", "n/a", "image", "photo"]);

export async function reviewSite(siteId: string): Promise<ReviewSummary> {
  const dir = pagesDir(siteId);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));

  const summary: ReviewSummary = {
    siteId,
    pageCount: files.length,
    sectionsByType: {},
    totalImages: 0,
    imagesMissingAlt: 0,
    imagesWithSuspiciousAlt: 0,
    pagesMissingDescription: [],
    pagesWithNoSections: [],
  };

  for (const file of files) {
    const raw = await readFile(path.join(dir, file), "utf-8");
    const page = JSON.parse(raw) as ScrapedPage;

    if (!page.meta.description) summary.pagesMissingDescription.push(page.url);
    if (page.sections.length === 0) summary.pagesWithNoSections.push(page.url);

    for (const section of page.sections) {
      summary.sectionsByType[section.sectionType] = (summary.sectionsByType[section.sectionType] ?? 0) + 1;
      for (const image of section.images) {
        summary.totalImages += 1;
        if (!image.alt) {
          summary.imagesMissingAlt += 1;
        } else if (SUSPICIOUS_ALT_VALUES.has(image.alt.trim().toLowerCase())) {
          summary.imagesWithSuspiciousAlt += 1;
        }
      }
    }
  }

  return summary;
}

export function printReviewSummary(summary: ReviewSummary): void {
  console.log(`\nSite: ${summary.siteId}`);
  console.log(`Pages scraped: ${summary.pageCount}`);
  console.log(`Sections by type:`);
  for (const [type, count] of Object.entries(summary.sectionsByType)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log(
    `Images: ${summary.totalImages} (${summary.imagesMissingAlt} missing alt text, ${summary.imagesWithSuspiciousAlt} with placeholder-looking alt text like "null")`,
  );
  if (summary.pagesMissingDescription.length > 0) {
    console.log(`Pages missing meta description (${summary.pagesMissingDescription.length}):`);
    for (const url of summary.pagesMissingDescription) console.log(`  - ${url}`);
  }
  if (summary.pagesWithNoSections.length > 0) {
    console.log(`Pages with zero extracted sections (${summary.pagesWithNoSections.length}) — check adapter:`);
    for (const url of summary.pagesWithNoSections) console.log(`  - ${url}`);
  }
}
