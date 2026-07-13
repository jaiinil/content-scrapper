import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import express from "express";
import { detectAdapter } from "../adapters/registry.js";
import { closeBrowser, renderPage } from "../fetch/browser.js";
import { checkUrlAllowed, listAllowedDomains } from "../security/allowlist.js";
import { startSiteScrapeJob } from "../jobs/siteScrapeJob.js";
import { findLatestJobForSite, getJob } from "../jobs/store.js";
import { isValidPageFileName, isValidSiteId, pagesDir, resolvePageFilePath } from "../storage/paths.js";
import type { ScrapedPage } from "../types.js";

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/allowed-domains", async (_req, res, next) => {
  try {
    res.json({ domains: await listAllowedDomains() });
  } catch (err) {
    next(err);
  }
});

app.post("/api/scrape", async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url) {
    res.status(400).json({ error: "Missing \"url\" in request body." });
    return;
  }

  const check = await checkUrlAllowed(url);
  if (!check.allowed) {
    res.status(403).json({ error: check.reason });
    return;
  }

  try {
    const html = await renderPage(url);
    const adapter = detectAdapter(html, url);
    const { meta, sections } = adapter.extract(html, url);
    const page: ScrapedPage = {
      siteId: new URL(url).hostname,
      url,
      meta,
      sections,
      scrapedAt: new Date().toISOString(),
    };
    page.adapterUsed = adapter.id;
    res.json({ page, adapterUsed: adapter.id });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to scrape that URL." });
  }
});

app.post("/api/sites/scrape", async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url) {
    res.status(400).json({ error: "Missing \"url\" in request body." });
    return;
  }

  const check = await checkUrlAllowed(url);
  if (!check.allowed) {
    res.status(403).json({ error: check.reason });
    return;
  }

  try {
    const job = startSiteScrapeJob(url);
    res.json({ jobId: job.jobId, siteId: job.siteId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not start the scrape job." });
  }
});

app.get("/api/jobs/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Unknown job id." });
    return;
  }
  res.json({ job });
});

app.get("/api/sites/:siteId/latest-job", (req, res) => {
  const { siteId } = req.params;
  if (!isValidSiteId(siteId)) {
    res.status(400).json({ error: "Invalid site id." });
    return;
  }
  const job = findLatestJobForSite(siteId);
  res.json({ job: job ?? null });
});

app.get("/api/sites/:siteId/pages", async (req, res) => {
  const { siteId } = req.params;
  if (!isValidSiteId(siteId)) {
    res.status(400).json({ error: "Invalid site id." });
    return;
  }

  try {
    const dir = pagesDir(siteId);
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    const pages = await Promise.all(
      files.map(async (fileName) => {
        try {
          const raw = await readFile(path.join(dir, fileName), "utf-8");
          const page = JSON.parse(raw) as ScrapedPage;
          return {
            fileName,
            url: page.url,
            title: page.meta.title,
            sectionCount: page.sections.length,
            adapterUsed: page.adapterUsed,
          };
        } catch {
          return { fileName, url: fileName, title: undefined, sectionCount: 0, adapterUsed: undefined };
        }
      }),
    );
    pages.sort((a, b) => a.url.localeCompare(b.url));
    res.json({ pages });
  } catch (err) {
    const notFound = (err as NodeJS.ErrnoException)?.code === "ENOENT";
    res.status(notFound ? 404 : 500).json({ error: notFound ? "No pages scraped for this site yet." : "Failed to list pages." });
  }
});

app.get("/api/sites/:siteId/pages/:fileName", async (req, res) => {
  const { siteId, fileName } = req.params;
  if (!isValidSiteId(siteId) || !isValidPageFileName(fileName)) {
    res.status(400).json({ error: "Invalid site id or file name." });
    return;
  }
  const filePath = resolvePageFilePath(siteId, fileName);
  if (!filePath) {
    res.status(400).json({ error: "Invalid file path." });
    return;
  }

  try {
    const raw = await readFile(filePath, "utf-8");
    res.json({ page: JSON.parse(raw) as ScrapedPage });
  } catch (err) {
    const notFound = (err as NodeJS.ErrnoException)?.code === "ENOENT";
    res.status(notFound ? 404 : 500).json({ error: notFound ? "Page not found." : "Failed to read page." });
  }
});

// Safety net: guarantees JSON even for errors Express's default handler would otherwise
// render as an HTML stack-trace page (e.g. malformed request bodies) — that HTML response
// is what causes the frontend's res.json() to blow up with "Unexpected end of JSON input".
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (!res.headersSent) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected server error." });
  }
});

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`Content scrapper UI running at http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await closeBrowser();
      process.exit(0);
    });
  });
}
