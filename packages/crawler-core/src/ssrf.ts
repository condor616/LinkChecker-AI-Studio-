import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const hostSafetyCache = new Map<string, boolean>();

export function isPrivateIpAddress(address: string): boolean {
  if (address === '::1') return true;

  if (address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) {
    return true;
  }

  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;

  return false;
}

export async function isSafeHostname(hostname: string): Promise<boolean> {
  const normalized = hostname.toLowerCase();

  if (hostSafetyCache.has(normalized)) {
    return hostSafetyCache.get(normalized)!;
  }

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    hostSafetyCache.set(normalized, false);
    return false;
  }

  if (isIP(normalized) && isPrivateIpAddress(normalized)) {
    hostSafetyCache.set(normalized, false);
    return false;
  }

  try {
    const results = await lookup(normalized, { all: true, verbatim: true });
    const isSafe = results.every((result) => !isPrivateIpAddress(result.address));
    hostSafetyCache.set(normalized, isSafe);
    return isSafe;
  } catch {
    hostSafetyCache.set(normalized, true);
    return true;
  }
}
