import { Command } from "commander";
import { loadSiteConfig } from "./storage/siteConfig.js";
import { crawlSite } from "./pipeline/crawl.js";
import { extractSite } from "./pipeline/extract.js";
import { printReviewSummary, reviewSite } from "./pipeline/review.js";

const program = new Command();
program.name("scraper").description("Site -> section-wise content scraper");

program
  .command("crawl <siteId>")
  .description("Discover all URLs for a site (via sitemap) and save them to data/<siteId>/urls.json")
  .action(async (siteId: string) => {
    const config = await loadSiteConfig(siteId);
    const urls = await crawlSite(config);
    console.log(`Discovered ${urls.length} URLs for ${siteId} -> data/${siteId}/urls.json`);
  });

program
  .command("extract <siteId>")
  .description("Render + extract section-wise content for every crawled URL")
  .option("-c, --concurrency <n>", "parallel page renders", "3")
  .option("-l, --limit <n>", "only process the first N urls (for testing)")
  .option("-u, --url <url...>", "extract only these specific URLs, skipping urls.json")
  .action(async (siteId: string, opts: { concurrency: string; limit?: string; url?: string[] }) => {
    const config = await loadSiteConfig(siteId);
    const result = await extractSite(config, {
      concurrency: Number(opts.concurrency),
      limit: opts.limit ? Number(opts.limit) : undefined,
      onlyUrls: opts.url,
    });
    console.log(`Extracted ${result.succeeded}/${result.total} pages for ${siteId}`);
    if (result.failed.length > 0) {
      console.log(`Failed (${result.failed.length}):`);
      for (const f of result.failed) console.log(`  - ${f.url}: ${f.error}`);
    }
  });

program
  .command("review <siteId>")
  .description("Summarize staged content for a site (section counts, missing meta/alt text)")
  .action(async (siteId: string) => {
    const summary = await reviewSite(siteId);
    printReviewSummary(summary);
  });

program.parseAsync(process.argv);
