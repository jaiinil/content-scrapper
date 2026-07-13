import type { SiteAdapter } from "../types.js";
import { kimptonAdapter } from "./kimpton.js";
import { genericAdapter } from "./generic.js";

/** Order matters for detectAdapter: more specific adapters first, generic last. */
const adapters: SiteAdapter[] = [kimptonAdapter, genericAdapter];

const registry = new Map(adapters.map((a) => [a.id, a]));

export function getAdapter(id: string): SiteAdapter {
  const adapter = registry.get(id);
  if (!adapter) {
    throw new Error(`Unknown adapter "${id}". Available: ${[...registry.keys()].join(", ")}`);
  }
  return adapter;
}

/** Picks the first adapter that recognizes this page's markup, falling back to the generic heuristic extractor. */
export function detectAdapter(html: string, pageUrl: string): SiteAdapter {
  for (const adapter of adapters) {
    if (adapter.canHandle?.(html, pageUrl)) return adapter;
  }
  return genericAdapter;
}
