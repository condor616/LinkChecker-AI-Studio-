export const FAILED_CLOUDFLARE_CHALLENGE = 'Failed Cloudflare Challenge';

/** Strong interstitial / challenge-page markers (not merely "behind Cloudflare CDN"). */
const STRONG_CHALLENGE_RE =
  /just a moment|checking your browser|cf-challenge|cf-browser-verification|challenge-platform|cf-turnstile|__cf_chl|cdn-cgi\/challenge|enable javascript and cookies|why have i been blocked|ddos protection by|please wait while we verify|attention required/i;

/**
 * FlareSolverr / Chromium often reports HTTP 200 for built-in net-error pages
 * (e.g. "HTTP ERROR 404") while the origin actually returned 4xx/5xx.
 * Scan the full body — the error code is often far past the first few KB of CSS/JS.
 */
const CHROMIUM_HTTP_ERROR_RE = /HTTP ERROR\s+(\d{3})/i;
const CHROMIUM_NETERROR_RE =
  /class=["']?neterror\b|icon-generic|getMainFrameErrorIconCssClass|error-code/i;

/**
 * If `html` looks like Chromium's built-in network error interstitial, return the
 * embedded HTTP status (4xx/5xx). Otherwise null.
 */
export function parseChromiumNetErrorStatus(html: string | null | undefined): number | null {
  if (!html) return null;
  const match = html.match(CHROMIUM_HTTP_ERROR_RE);
  if (!match) return null;
  if (!CHROMIUM_NETERROR_RE.test(html)) return null;
  const code = Number(match[1]);
  if (!Number.isFinite(code) || code < 400 || code > 599) return null;
  return code;
}

export function isChromiumNetErrorPage(html: string | null | undefined): boolean {
  return parseChromiumNetErrorStatus(html) != null;
}

/**
 * Detect Cloudflare / WAF bot challenges from status, headers, and a short body preview.
 * Must run before auth-gated heuristics so challenge pages are not mislabeled as login walls.
 *
 * Important: many healthy sites are proxied by Cloudflare (`server: cloudflare`, `cf-ray`,
 * scripts under `*.cloudflare.com`). Those alone are NOT a challenge.
 */
export function isCloudflareChallenge(
  statusCode: number | null | undefined,
  headers: Record<string, string> | Headers | null | undefined,
  bodyPreview: string | null | undefined,
): boolean {
  const headerMap = normalizeHeaders(headers);
  const body = (bodyPreview || '').slice(0, 4000);
  const bodyLower = body.toLowerCase();

  const cfMitigated = (headerMap['cf-mitigated'] || '').toLowerCase();
  if (cfMitigated.includes('challenge') || cfMitigated.includes('managed_challenge')) {
    return true;
  }

  const server = (headerMap.server || '').toLowerCase();
  const hasCfRay = Boolean(headerMap['cf-ray']);
  const looksLikeCf = hasCfRay || server.includes('cloudflare');

  // Explicit challenge interstitial copy / markup (any status, including HTTP 200).
  if (STRONG_CHALLENGE_RE.test(body)) {
    return true;
  }

  // Blocked responses from Cloudflare often return 403/503/429 HTML without strong title text.
  if (looksLikeCf && statusCode != null && (statusCode === 403 || statusCode === 503 || statusCode === 429)) {
    if (!body || bodyLower.includes('<!doctype html') || bodyLower.includes('<html') || bodyLower.includes('cloudflare')) {
      return true;
    }
  }

  return false;
}

/**
 * Human-readable challenge failure for the UI / DB error column.
 * Always starts with FAILED_CLOUDFLARE_CHALLENGE so existing filters keep working.
 */
export function formatChallengeError(opts: {
  statusCode?: number | null;
  headers?: Record<string, string> | Headers | null;
  bodyPreview?: string | null;
  note?: string | null;
}): string {
  const headerMap = normalizeHeaders(opts.headers);
  const body = (opts.bodyPreview || '').slice(0, 4000);
  const lines = [FAILED_CLOUDFLARE_CHALLENGE];

  const server = headerMap.server || '';
  const cfRay = headerMap['cf-ray'] || '';
  const cfMitigated = headerMap['cf-mitigated'] || '';
  const meta: string[] = [];
  if (opts.statusCode != null) meta.push(`HTTP ${opts.statusCode}`);
  if (server) meta.push(`Server: ${server}`);
  if (cfRay) meta.push(`cf-ray: ${cfRay}`);
  if (cfMitigated) meta.push(`cf-mitigated: ${cfMitigated}`);

  const serverLower = server.toLowerCase();
  if (cfRay || serverLower.includes('cloudflare')) {
    meta.push('WAF: Cloudflare');
  } else if (serverLower.includes('akamai') || /edgesuite|akamaighost/i.test(body)) {
    meta.push('WAF: Akamai (not solvable by FlareSolverr)');
  } else if (server) {
    meta.push('WAF: unknown');
  } else if (STRONG_CHALLENGE_RE.test(body)) {
    meta.push('WAF: likely Cloudflare (body markers, no CF headers)');
  }

  if (meta.length > 0) lines.push(meta.join(' · '));

  const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch?.[1]?.trim()) {
    lines.push(`Title: ${titleMatch[1].replace(/\s+/g, ' ').trim()}`);
  }

  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
  if (text) lines.push(`Body: ${text}`);

  if (opts.note?.trim()) lines.push(opts.note.trim());

  return lines.join('\n');
}

function normalizeHeaders(
  headers: Record<string, string> | Headers | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (typeof (headers as Headers).forEach === 'function' && typeof (headers as Headers).get === 'function') {
    (headers as Headers).forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
    return out;
  }
  for (const [key, value] of Object.entries(headers as Record<string, string>)) {
    out[key.toLowerCase()] = value;
  }
  return out;
}
