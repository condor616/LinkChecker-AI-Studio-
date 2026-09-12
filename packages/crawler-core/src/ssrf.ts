import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const hostSafetyCache = new Map<string, boolean>();

export function clearHostSafetyCache(): void {
  hostSafetyCache.clear();
}

export function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized === '::1' || normalized === '::' || normalized === '0:0:0:0:0:0:0:0') {
    return true;
  }

  // IPv4-mapped IPv6 (:ffff:x.x.x.x)
  const v4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) {
    return isPrivateIpAddress(v4Mapped[1]);
  }

  if (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized === '::ffff:0:0' ||
    normalized.startsWith('100:')
  ) {
    return true;
  }

  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / some cloud metadata ranges
  if (a >= 224) return true; // multicast / reserved

  return false;
}

export async function isSafeHostname(hostname: string): Promise<boolean> {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');

  if (hostSafetyCache.has(normalized)) {
    return hostSafetyCache.get(normalized)!;
  }

  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === 'metadata.google.internal' ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.local')
  ) {
    hostSafetyCache.set(normalized, false);
    return false;
  }

  if (isIP(normalized) && isPrivateIpAddress(normalized)) {
    hostSafetyCache.set(normalized, false);
    return false;
  }

  try {
    const results = await lookup(normalized, { all: true, verbatim: true });
    if (!results.length) {
      hostSafetyCache.set(normalized, false);
      return false;
    }
    const isSafe = results.every((result) => !isPrivateIpAddress(result.address));
    hostSafetyCache.set(normalized, isSafe);
    return isSafe;
  } catch {
    // Fail closed: unresolved hosts must not be fetched.
    hostSafetyCache.set(normalized, false);
    return false;
  }
}

export type OutboundUrlCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '');
}

function isSameOrSubdomain(hostname: string, root: string): boolean {
  const host = normalizeHostname(hostname);
  const base = normalizeHostname(root);
  return host === base || host.endsWith(`.${base}`);
}

/**
 * Validates that an outbound URL is http(s) and not an SSRF target.
 * When `startUrl` is provided, private targets under the same registrable host
 * as the scan start URL are allowed (intentional crawl of a private origin).
 */
export async function assertSafeOutboundUrl(
  urlString: string,
  options?: { startUrl?: string },
): Promise<OutboundUrlCheck> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `Blocked scheme: ${url.protocol}` };
  }

  if (url.username || url.password) {
    return { ok: false, reason: 'URLs with embedded credentials are not allowed' };
  }

  const isSafeTarget = await isSafeHostname(url.hostname);
  if (isSafeTarget) {
    return { ok: true, url };
  }

  if (options?.startUrl) {
    try {
      const startHost = normalizeHostname(new URL(options.startUrl).hostname);
      const targetHost = normalizeHostname(url.hostname);
      if (isSameOrSubdomain(targetHost, startHost)) {
        return { ok: true, url };
      }
    } catch {
      // fall through
    }
  }

  return { ok: false, reason: 'Blocked by SSRF protection policy' };
}
