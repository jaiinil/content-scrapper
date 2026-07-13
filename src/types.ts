export interface ImageRef {
  src: string;
  alt: string;
}

export interface LinkRef {
  text: string;
  href: string;
}

export interface NormalizedSection {
  sectionType: string;
  order: number;
  heading?: string;
  subheading?: string;
  bodyHtml?: string;
  images: ImageRef[];
  links?: LinkRef[];
}

export interface PageMeta {
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  structuredData: unknown[];
}

export interface ScrapedPage {
  siteId: string;
  url: string;
  meta: PageMeta;
  sections: NormalizedSection[];
  scrapedAt: string;
  adapterUsed?: string;
}

export interface SiteAdapter {
  id: string;
  /** Sniff the rendered HTML to decide whether this adapter's selectors apply. Adapters without this are only used when explicitly configured (never auto-detected). */
  canHandle?(html: string, pageUrl: string): boolean;
  extract(html: string, pageUrl: string): { meta: PageMeta; sections: NormalizedSection[] };
}

export interface SiteConfig {
  siteId: string;
  baseUrl: string;
  discovery: {
    type: "sitemap";
    path: string;
  };
  /** Regex patterns (against the URL pathname) to skip — e.g. external redirects, PDFs. */
  excludePatterns?: string[];
  /** Omit to auto-detect the adapter per page instead of forcing one for the whole site. */
  adapter?: string;
}
