# Content Scrapper

A section-wise content scraper for migrating existing hotel property websites into a new CMS.
It scrapes a page (or an entire site), splits the content into logical sections (hero, body copy,
promotional "touts", testimonials, contact info, images with alt text, meta tags, JSON-LD structured
data), and stores it as normalized JSON — ready to be reviewed and, later, pushed into the target CMS
via its API.

Two ways to use it:
1. **CLI** — crawl + extract + review a whole site from the terminal (best for bulk migration runs).
2. **Web UI** — a small internal tool anyone on the team can use to preview a single page's scraped
   content, or kick off a whole-site scrape and browse the results, without touching the command line.

---

## 1. How it works

```
Site URL → Discover (sitemap.xml) → Render (headless browser) → Extract (adapter) → Normalized JSON
```

- **Render**: pages are rendered with a real headless browser (Playwright/Chromium), not a plain HTTP
  fetch — several sections on these hotel templates (amenity lists, nearby attractions, blog teasers)
  are populated client-side via AJAX after load, so a plain fetch would miss them.
- **Extract**: an *adapter* turns the rendered HTML into a list of normalized sections. There are two:
  - `kimpton-template-v1` — a precise adapter for the Kimpton/IHG hotel template (the 5 sites this
    project started with all use it): hero, content blocks, `.full_width_tout` promos, testimonials,
    footer contact info.
  - `generic-v1` — a heuristic fallback for any other site: walks headings/paragraphs/images in
    document order and segments them at heading boundaries. Used automatically whenever a page doesn't
    match a more specific adapter.
- **Adapter auto-detection**: you don't have to tell the tool which adapter to use — each adapter has a
  `canHandle(html)` check, and the first match wins (falling back to `generic-v1`).

### Normalized section shape

Every scraped page becomes a `ScrapedPage`:

```ts
{
  siteId: string;
  url: string;
  meta: {
    title, description, keywords, canonical,
    ogTitle, ogDescription, ogImage,
    structuredData: [...]   // raw JSON-LD blocks (schema.org/Hotel, FAQPage, etc.)
  },
  sections: [
    {
      sectionType: "hero" | "content-block" | "tout" | "testimonial" | "contact-info" | "media",
      order: number,
      heading?, subheading?, bodyHtml?,
      images: [{ src, alt }],
      links?: [{ text, href }],
    },
    ...
  ],
  adapterUsed: string,
  scrapedAt: string,
}
```

---

## 2. Prerequisites

- Node.js 18+ and npm
- Windows/macOS/Linux (developed and tested on Windows/PowerShell)

## 3. Setup

```powershell
npm install
npx playwright install chromium
```

This installs the dependencies and downloads the headless Chromium binary Playwright needs (~200MB,
one-time).

---

## 4. Using the CLI

The CLI works against a **site config** — a JSON file in `configs/sites/` describing where to start.

### 4.1 Site config format

`configs/sites/<siteId>.json`:

```json
{
  "siteId": "monaco-philadelphia",
  "baseUrl": "https://www.monaco-philadelphia.com",
  "discovery": { "type": "sitemap", "path": "/sitemap.xml" },
  "adapter": "kimpton-template-v1"
}
```

- `adapter` is **optional** — omit it to auto-detect the adapter per page instead of forcing one for
  the whole site (useful for a site you haven't classified yet).
- `excludePatterns` (optional): array of regex strings tested against the URL path, to skip pages
  (PDFs, external redirects, etc.).

Five configs already exist for the sites this project started with: `monaco-philadelphia`,
`hotelmarlowe`, `grayhotelchicago`, `epichotel`, `taconichotel`.

### 4.2 Commands

**Step 1 — Crawl** (discover every URL on the site via its sitemap):

```powershell
npm run scrape -- crawl monaco-philadelphia
```

Writes `data/monaco-philadelphia/urls.json`.

**Step 2 — Extract** (render + scrape every discovered URL):

```powershell
npm run scrape -- extract monaco-philadelphia
```

Writes one JSON file per page to `data/monaco-philadelphia/pages/`, plus an
`extract-summary.json` with success/failure counts.

Useful flags:

| Flag | Purpose |
|---|---|
| `-c, --concurrency <n>` | Parallel page renders (default `3`). Raise cautiously — you're hitting a real site. |
| `-l, --limit <n>` | Only process the first N URLs — handy for a quick smoke test before running the full site. |
| `-u, --url <url...>` | Extract only specific URLs, bypassing `urls.json` entirely (targeted re-checks). |

Example smoke test:

```powershell
npm run scrape -- extract monaco-philadelphia --limit 5
npm run scrape -- extract monaco-philadelphia --url "https://www.monaco-philadelphia.com/" "https://www.monaco-philadelphia.com/boutique-hotels-philadelphia/"
```

**Step 3 — Review** (sanity-check what was scraped before anyone acts on it):

```powershell
npm run scrape -- review monaco-philadelphia
```

Prints section counts by type, total images (and how many are missing alt text, or have obviously
placeholder alt text like `"null"`), and lists any pages missing a meta description or that produced
zero sections (a sign the adapter needs a look).

### 4.3 Adding a new site

1. Add `configs/sites/<siteId>.json` (see format above). If you're not sure it's the same template as
   the existing 5, omit `"adapter"` — it'll auto-detect per page.
2. Run `crawl` → `extract` → `review` as above.
3. If `review` shows a lot of pages using `generic-v1` with thin/odd sections, the site probably needs
   its own adapter — copy `src/adapters/kimpton.ts` as a starting point, adjust the selectors to match
   the new template's markup, add a `canHandle()` check, and register it in
   `src/adapters/registry.ts`.

---

## 5. Using the Web UI

The UI is for anyone on the team to preview scraped content without using the terminal.

```powershell
npm run ui
```

Opens a server at **http://localhost:3000**.

### 5.1 Preview a single page

Paste a page URL, click **Scrape**. It renders that one page live and shows:
- Page meta (title, description, canonical, JSON-LD count)
- Each section as a card (heading, body copy, images with alt-text captions — missing/placeholder alt
  text is highlighted in red)
- A collapsible "Raw JSON" view of the full `ScrapedPage` object

### 5.2 Scrape a whole site

Paste a site's homepage/domain, click **Start**. This:
1. Discovers every URL via `sitemap.xml`
2. Scrapes each page in the background (same engine as the CLI), with a live progress bar
3. Populates a clickable page list as results come in — click any page to view it the same way as the
   single-page preview

Whole-site jobs run as in-memory background jobs — if the server restarts mid-job you'll need to
restart it, but any pages it already finished are saved to disk under `data/<siteId>/pages/` and
remain browsable.

### 5.3 Which sites can be scraped (`configs/allowed-domains.json`)

By default any site is allowed:

```json
["*"]
```

The server still resolves the hostname and rejects anything that points at a private/internal IP
address (loopback, RFC1918, link-local) — so it won't scrape `localhost`, `192.168.x.x`, internal
company servers, etc., even with the wildcard. That guard exists because the server renders whatever
URL is submitted in a real headless browser, so without it, this tool could be used to probe internal
network addresses (SSRF).

To restrict the UI to a specific set of sites instead, replace `"*"` with an explicit hostname list:

```json
[
  "www.monaco-philadelphia.com",
  "www.hotelmarlowe.com",
  "www.grayhotelchicago.com",
  "www.epichotel.com",
  "www.taconichotel.com"
]
```

No adapter registration is required to add a site either way — `generic-v1` handles anything without a
dedicated adapter.

---

## 6. Project structure

```
configs/
  sites/*.json          Per-site config for the CLI (baseUrl, sitemap path, adapter)
  allowed-domains.json  Hostnames the web UI is permitted to scrape

src/
  types.ts              Core data shapes: ScrapedPage, NormalizedSection, SiteAdapter, SiteConfig
  cli.ts                CLI entrypoint (crawl / extract / review commands)

  fetch/browser.ts       Playwright wrapper — renders a URL and returns final HTML
  discovery/sitemap.ts   Sitemap.xml discovery (handles sitemap indexes too)

  adapters/
    shared.ts             Common extraction helpers (meta, images, links, headings)
    kimpton.ts             Kimpton/IHG hotel template adapter
    generic.ts              Fallback heuristic adapter for unknown templates
    registry.ts              Adapter lookup + auto-detection (canHandle)

  pipeline/
    crawl.ts               Discover + persist a site's URL list
    extract.ts              Render + extract every URL, write per-page JSON
    review.ts                Summarize staged content (section counts, missing alt/meta)

  storage/
    paths.ts                Filesystem layout for data/ + path-safety validation
    siteConfig.ts             Loads + validates configs/sites/*.json (zod)

  security/allowlist.ts    Domain allowlist + basic SSRF guard for the web UI

  jobs/
    store.ts                In-memory job-status tracker
    siteScrapeJob.ts          Runs crawl+extract as a background job for the UI

  server/index.ts          Express server: REST API + serves public/

public/index.html          The web UI (single static page, no build step)

data/                      Output — gitignored. data/<siteId>/urls.json, data/<siteId>/pages/*.json
```

---

## 7. What's not built yet

- **Pushing content to the target CMS.** Everything above produces normalized, reviewable JSON on
  disk — the next phase is a CMS client that reads that JSON and POSTs it section-by-section to the
  CMS's API, with an idempotency mapping (source URL → CMS content ID) so re-runs update instead of
  duplicating content. Deliberately out of scope until the target CMS's API (auth, endpoints, request
  schema) is confirmed.
- **Image re-upload.** Scraped image URLs currently point at the *source* site. Whether to re-upload
  them into the new CMS's media library (vs. keep referencing the original URLs) is a decision for the
  CMS-push phase.
- **Hosting the web UI for the whole company.** It currently only runs locally (`npm run ui`). Sharing
  it company-wide needs an internal server/VM or cloud target to deploy to.
