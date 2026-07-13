import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { SiteConfig } from "../types.js";

const siteConfigSchema = z.object({
  siteId: z.string(),
  baseUrl: z.string().url(),
  discovery: z.object({
    type: z.literal("sitemap"),
    path: z.string(),
  }),
  excludePatterns: z.array(z.string()).optional(),
  adapter: z.string().optional(),
});

const CONFIGS_DIR = path.resolve(process.cwd(), "configs", "sites");

export async function loadSiteConfig(siteId: string): Promise<SiteConfig> {
  const filePath = path.join(CONFIGS_DIR, `${siteId}.json`);
  const raw = await readFile(filePath, "utf-8");
  const parsed = siteConfigSchema.parse(JSON.parse(raw));
  return parsed;
}
