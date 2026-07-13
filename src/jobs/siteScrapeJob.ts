import { crawlSite } from "../pipeline/crawl.js";
import { extractSite } from "../pipeline/extract.js";
import { createJob, updateJob, type JobProgress } from "./store.js";
import type { SiteConfig } from "../types.js";

export function startSiteScrapeJob(rawUrl: string, concurrency = 3): JobProgress {
  const parsed = new URL(rawUrl);
  const siteId = parsed.hostname;
  const baseUrl = parsed.origin;
  const job = createJob(siteId, baseUrl);

  void runJob(job.jobId, siteId, baseUrl, concurrency).catch((err) => {
    updateJob(job.jobId, {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      finishedAt: new Date().toISOString(),
    });
  });

  return job;
}

async function runJob(jobId: string, siteId: string, baseUrl: string, concurrency: number): Promise<void> {
  const config: SiteConfig = {
    siteId,
    baseUrl,
    discovery: { type: "sitemap", path: "/sitemap.xml" },
    // adapter intentionally omitted — extractSite auto-detects per page
  };

  const urls = await crawlSite(config);
  updateJob(jobId, { status: "extracting", total: urls.length });

  const result = await extractSite(config, {
    concurrency,
    keepBrowserOpen: true,
    onProgress: (completed, total) => {
      updateJob(jobId, { completed, total });
    },
  });

  updateJob(jobId, { status: "done", failed: result.failed, finishedAt: new Date().toISOString() });
}
