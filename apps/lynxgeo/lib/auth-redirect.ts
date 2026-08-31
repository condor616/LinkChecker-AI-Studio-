/** Relative in-app paths only — reject protocol-relative and encoded-slash open redirects. */
export function safeCallbackUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) return null;
  if (decoded.includes('://')) return null;
  return decoded;
}
