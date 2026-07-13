import { promises as dns } from "node:dns";
import { readFile } from "node:fs/promises";
import path from "node:path";

let allowedDomainsCache: Set<string> | undefined;

async function loadAllowedDomains(): Promise<Set<string>> {
  if (!allowedDomainsCache) {
    const filePath = path.resolve(process.cwd(), "configs", "allowed-domains.json");
    const raw = await readFile(filePath, "utf-8");
    const domains = JSON.parse(raw) as string[];
    allowedDomainsCache = new Set(domains.map((d) => d.toLowerCase()));
  }
  return allowedDomainsCache;
}

/** Not exhaustive (no DNS-rebinding TOCTOU protection), but blocks the obvious SSRF targets: loopback, RFC1918, link-local. */
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./,
  /^::1$/,
  /^f[cd][0-9a-f]{2}:/i,
  /^fe80:/i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

export interface UrlCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function checkUrlAllowed(rawUrl: string): Promise<UrlCheckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "That doesn't look like a valid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, reason: "Only http/https URLs are allowed." };
  }

  const allowedDomains = await loadAllowedDomains();
  const hostname = url.hostname.toLowerCase();
  // "*" in configs/allowed-domains.json means "any site" — no hostname allowlisting.
  // Private/internal IPs are still blocked below regardless of this setting.
  if (!allowedDomains.has("*") && !allowedDomains.has(hostname)) {
    return {
      allowed: false,
      reason: `"${hostname}" isn't on the approved site list yet. Ask an admin to add it to configs/allowed-domains.json.`,
    };
  }

  try {
    const { address } = await dns.lookup(hostname);
    if (isPrivateIp(address)) {
      return { allowed: false, reason: "This hostname resolves to a private/internal address." };
    }
  } catch {
    return { allowed: false, reason: "Could not resolve hostname." };
  }

  return { allowed: true };
}

/** Exposed for the admin endpoint / tests; forces a re-read of configs/allowed-domains.json on next check. */
export function clearAllowlistCache(): void {
  allowedDomainsCache = undefined;
}

export async function listAllowedDomains(): Promise<string[]> {
  const domains = await loadAllowedDomains();
  return [...domains].sort();
}
